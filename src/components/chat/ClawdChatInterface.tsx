import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowUp, Monitor, Cpu } from 'lucide-react';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/chat/ConnectionStatus';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { ModeSelector } from '@/components/chat/ModeSelector';
// GpuStatus removed from toolbar — component kept for future use
import { ZuberiContextMenu } from '@/components/layout/ZuberiContextMenu';
import { AttachButton, FileChips, type QueuedFile } from '@/components/chat/FileAttachments';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const SESSION_KEY = 'agent:main:main';

type ModelEntry = { id: string; name: string; parameterSize?: string; family?: string };

function buildConnectRequest(token: string): WebSocketMessage {
  return {
    type: 'req',
    id: crypto.randomUUID(),
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'openclaw-control-ui',
        displayName: 'Zuberi',
        version: '0.1.0',
        platform: 'windows',
        mode: 'ui',
      },
      role: 'operator',
      scopes: ['operator.admin', 'operator.approvals'],
      caps: [],
      auth: { token },
    },
  };
}

/**
 * Extract text from an OpenClaw message object.
 * Handles four payload shapes:
 *   1. Content-block array: { content: [{ type: "text", text: "..." }] }
 *   2. Plain string content: { content: "..." }  or bare string
 *   3. Top-level .text:      { text: "..." }
 *   4. Agent stream format:  { data: { text: "...", delta: "..." } }
 *
 * Never returns null when there is actual text content in the message.
 */
function extractTextFromMessage(message: unknown): string | null {
  // Bare string
  if (typeof message === 'string') return message;

  if (!message || typeof message !== 'object') return null;
  const m = message as Record<string, unknown>;

  // String content
  if (typeof m.content === 'string') return m.content;

  // Content-block array (OpenClaw standard format)
  // Accepts any block with a .text field, regardless of .type, to handle
  // varied payloads.  Also handles bare string entries in the array.
  if (Array.isArray(m.content)) {
    const parts = m.content
      .map((block: unknown): string | null => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          if (typeof b.text === 'string') return b.text;
        }
        return null;
      })
      .filter((t): t is string => t !== null);
    if (parts.length > 0) return parts.join('\n');
  }

  // Top-level .text
  if (typeof m.text === 'string') return m.text;

  // Nested .data.text (agent stream format)
  if (m.data && typeof m.data === 'object') {
    const data = m.data as Record<string, unknown>;
    if (typeof data.text === 'string') return data.text;
  }

  return null;
}

export function ClawdChatInterface() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [handshakeComplete, setHandshakeComplete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handshakeCompleteRef = useRef(false);
  const gatewayTokenRef = useRef<string | null>(null);
  const sendRef = useRef<(msg: WebSocketMessage) => void>(() => {});
  // Track the active chat run for correlating streaming deltas
  const activeRunIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  // Track pending RPC request IDs so we can match ack responses
  const pendingRequestIdsRef = useRef<Set<string>>(new Set());
  // Models state — populated from Ollama API on KILO
  const [models, setModels] = useState<ModelEntry[]>([]);
  // GPU model loaded in VRAM — polled from Ollama /api/ps
  const [gpuModel, setGpuModel] = useState<string | null>(null);
  // File attachment state
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── New Conversation handler (shared between menu event and context menu) ──
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setDraft('');
    setQueuedFiles([]);
    activeRunIdRef.current = null;
    streamingMessageIdRef.current = null;
    pendingRequestIdsRef.current.clear();
    console.info('[Zuberi] New conversation started');
  }, []);

  // Load token from .openclaw.local.json via Tauri IPC on mount
  useEffect(() => {
    invoke<string>('read_gateway_token')
      .then((token) => {
        gatewayTokenRef.current = token;
        setGatewayToken(token);
        console.info('[OpenClaw] Gateway token loaded');
      })
      .catch((err) => {
        console.error('[OpenClaw] Failed to load gateway token:', err);
      });
  }, []);

  // ── Menu event listeners ──────────────────────────────────────────
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    // New Conversation: clear chat and reset streaming state
    unlisteners.push(listen('new-conversation', handleNewConversation));

    // Open Settings (placeholder — no settings panel yet)
    unlisteners.push(
      listen('open-settings', () => {
        console.info('[Zuberi] Settings requested — panel not yet implemented');
      }),
    );

    // Zoom controls
    unlisteners.push(
      listen<string>('zoom', (event) => {
        const current = parseFloat(document.body.style.zoom || '1');
        switch (event.payload) {
          case 'in':
            document.body.style.zoom = String(Math.min(current + 0.1, 2.0));
            break;
          case 'out':
            document.body.style.zoom = String(Math.max(current - 0.1, 0.5));
            break;
          case 'reset':
            document.body.style.zoom = '1';
            break;
        }
      }),
    );

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, [handleNewConversation]);

  // Build WebSocket URL with token query param for gateway auth
  const wsUrl = useMemo(() => {
    if (!gatewayToken) return 'ws://127.0.0.1:18789';
    const url = `ws://127.0.0.1:18789?token=${encodeURIComponent(gatewayToken)}`;
    // Log URL with redacted token (last 4 chars only)
    const last4 = gatewayToken.slice(-4);
    console.info(`[OpenClaw] WebSocket URL: ws://127.0.0.1:18789?token=...${last4}`);
    return url;
  }, [gatewayToken]);

  // v2026.3.1+: when the URL contains ?token=, the gateway performs implicit
  // connect on WebSocket upgrade.  Sending an explicit connect RPC after that
  // is rejected ("connect is only valid as the first request").  Detect this
  // and skip the explicit connect, marking handshake complete immediately.
  const urlHasToken = wsUrl.includes('?token=');

  const { send, connectionState } = useWebSocket({
    autoConnect: gatewayToken !== null,
    url: wsUrl,
    // Only send explicit connect when URL does NOT carry the token
    onOpen: !urlHasToken && gatewayToken ? buildConnectRequest(gatewayToken) : undefined,
    onConnected: () => {
      if (urlHasToken) {
        // Implicit auth — handshake is already done on upgrade
        handshakeCompleteRef.current = true;
        setHandshakeComplete(true);
        console.info('[OpenClaw] Gateway handshake complete (implicit token auth)');
      } else {
        handshakeCompleteRef.current = false;
        setHandshakeComplete(false);
      }
    },
    onMessage: (message) => {
      // ── DEBUG: trace every incoming WS message ────────────────────
      console.info('[WS:RAW]', JSON.stringify(message).slice(0, 800));

      // ── Handle connect handshake (explicit RPC path only) ─────────
      // Only consume this `res` if it is NOT a known pending RPC id,
      // which means it is the connect handshake response.  This prevents
      // chat.send acks from being swallowed when handshake failed.
      if (
        message.type === 'res' &&
        !handshakeCompleteRef.current &&
        !pendingRequestIdsRef.current.has(message.id as string)
      ) {
        if (message.ok) {
          handshakeCompleteRef.current = true;
          setHandshakeComplete(true);
          console.info('[OpenClaw] Gateway handshake complete (explicit connect)');
        } else {
          console.error('[OpenClaw] Gateway handshake failed:', message.error);
          // Mark handshake as "done-but-failed" so subsequent res messages
          // fall through to the RPC handler instead of being swallowed.
          handshakeCompleteRef.current = true;
          setHandshakeComplete(false); // keep UI aware it's not fully connected
          console.warn('[OpenClaw] Handshake marked done-after-failure — RPCs will flow through');
        }
        return;
      }

      // ── Handle connect.challenge ─────────────────────────────────
      if (message.type === 'event' && message.event === 'connect.challenge') {
        const token = gatewayTokenRef.current;
        if (!token) {
          console.error('[OpenClaw] Received challenge but no token loaded');
          return;
        }
        sendRef.current(buildConnectRequest(token));
        return;
      }

      // ── Handle RPC responses (chat.send ack, etc.) ─────────────────
      if (message.type === 'res' && typeof message.id === 'string') {
        if (pendingRequestIdsRef.current.has(message.id)) {
          pendingRequestIdsRef.current.delete(message.id);
          if (!message.ok) {
            const errMsg =
              typeof message.error === 'object' && message.error !== null
                ? (message.error as Record<string, unknown>).message ?? 'Request failed'
                : 'Request failed';
            console.error('[OpenClaw] chat.send failed:', errMsg);
            setMessages((current) => [
              ...current,
              { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${errMsg}` },
            ]);
          }
        }
        return;
      }

      // ── Handle chat broadcast events (delta / final / error / aborted) ──
      if (message.type === 'event' && message.event === 'chat') {
        console.info('[WS:CHAT-EVENT]', JSON.stringify(message.payload ?? null).slice(0, 500));
        const payload = message.payload as
          | {
              runId?: string;
              sessionKey?: string;
              state?: 'delta' | 'final' | 'error' | 'aborted';
              message?: unknown;
              errorMessage?: string;
            }
          | undefined;
        if (!payload) return;

        // Ignore events for other sessions
        if (payload.sessionKey && payload.sessionKey !== SESSION_KEY) return;

        const state = payload.state;

        if (state === 'delta') {
          const text = extractTextFromMessage(payload.message);
          console.info('[WS:DELTA]', { text, rawMessage: JSON.stringify(payload.message ?? null).slice(0, 300) });
          if (typeof text !== 'string') return;

          // Assign streaming ID BEFORE the state updater — never mutate refs inside updaters.
          // React 19 StrictMode double-invokes updaters; ref mutation inside causes the
          // second invocation to take the wrong branch, dropping the message from state.
          if (!streamingMessageIdRef.current) {
            streamingMessageIdRef.current = crypto.randomUUID();
          }
          const streamId = streamingMessageIdRef.current;

          setMessages((current) => {
            const exists = current.some((entry) => entry.id === streamId);
            if (!exists) {
              return [...current, { id: streamId, role: 'assistant' as const, content: text }];
            }
            // OpenClaw sends cumulative text in deltas — replace, don't append
            return current.map((entry) =>
              entry.id === streamId ? { ...entry, content: text } : entry,
            );
          });
        } else if (state === 'final') {
          // Replace streaming message with final content if present
          const text = extractTextFromMessage(payload.message);
          console.info('[WS:FINAL]', { text, streamingId: streamingMessageIdRef.current, rawMessage: JSON.stringify(payload.message ?? null).slice(0, 300) });

          if (text && streamingMessageIdRef.current) {
            const finalStreamId = streamingMessageIdRef.current;
            setMessages((current) =>
              current.map((entry) =>
                entry.id === finalStreamId ? { ...entry, content: text } : entry,
              ),
            );
          } else if (text && !streamingMessageIdRef.current) {
            // Non-streaming final (e.g. command responses)
            setMessages((current) => [
              ...current,
              { id: crypto.randomUUID(), role: 'assistant', content: text },
            ]);
          }

          // Only clear refs for real finals (has text or matches our active run).
          // Heartbeat finals (no text, no matching runId) must not kill mid-stream state.
          if (text || !payload.runId || payload.runId === activeRunIdRef.current) {
            activeRunIdRef.current = null;
            streamingMessageIdRef.current = null;
          }
        } else if (state === 'error') {
          console.error('[WS:ERROR]', { errorMessage: payload.errorMessage, payload: JSON.stringify(payload).slice(0, 300) });
          const errText = payload.errorMessage ?? 'An error occurred';
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${errText}` },
          ]);
          activeRunIdRef.current = null;
          streamingMessageIdRef.current = null;
        } else if (state === 'aborted') {
          console.warn('[WS:ABORTED]', { runId: activeRunIdRef.current });
          // Keep whatever was streamed so far
          activeRunIdRef.current = null;
          streamingMessageIdRef.current = null;
        }
        return;
      }

      // ── Handle agent streaming events ─────────────────────────────
      // Agent events carry cumulative text in { data: { text, delta } }
      if (message.type === 'event' && message.event === 'agent') {
        console.info('[WS:AGENT-EVENT]', JSON.stringify(message.payload ?? null).slice(0, 500));
        const payload = message.payload as Record<string, unknown> | undefined;
        if (!payload) return;

        const text = extractTextFromMessage(payload);
        console.info('[WS:AGENT-TEXT]', { text: text?.slice(0, 200) });
        if (typeof text !== 'string') return;

        // Same pattern as delta handler — ref mutation must be outside the updater.
        if (!streamingMessageIdRef.current) {
          streamingMessageIdRef.current = crypto.randomUUID();
        }
        const agentStreamId = streamingMessageIdRef.current;

        setMessages((current) => {
          const exists = current.some((entry) => entry.id === agentStreamId);
          if (!exists) {
            return [...current, { id: agentStreamId, role: 'assistant' as const, content: text }];
          }
          return current.map((entry) =>
            entry.id === agentStreamId ? { ...entry, content: text } : entry,
          );
        });
        return;
      }

      // ── Silently ignore noisy periodic events ─────────────────────
      if (message.type === 'event' && (message.event === 'health' || message.event === 'tick')) {
        return;
      }

      // ── Catch-all: log any unhandled messages for debugging ──────
      console.info('[OpenClaw] Unhandled WS message:', JSON.stringify(message).slice(0, 500));
    },
  });

  // Keep sendRef in sync for challenge-response fallback
  sendRef.current = send;

  // Fetch available models directly from Ollama on KILO
  const fetchModels = useCallback(() => {
    fetch('http://localhost:11434/api/tags')
      .then((res) => res.json())
      .then((data: { models?: { name: string; details?: { parameter_size?: string; family?: string } }[] }) => {
        const list: ModelEntry[] = (data.models ?? []).map((m) => ({
          id: m.name,
          name: m.name,
          parameterSize: m.details?.parameter_size,
          family: m.details?.family,
        }));
        setModels(list);
      })
      .catch((err) => {
        console.error('[Zuberi] Failed to fetch Ollama models:', err);
      });
  }, []);

  // Auto-refresh models every 30s
  useEffect(() => {
    if (!handshakeComplete) return;
    fetchModels();
    const id = setInterval(fetchModels, 30_000);
    return () => clearInterval(id);
  }, [handshakeComplete, fetchModels]);

  // ── Poll Ollama /api/ps for currently loaded GPU model ─────────
  const fetchGpuModel = useCallback(() => {
    fetch('http://localhost:11434/api/ps')
      .then((res) => res.json())
      .then((data: { models?: { name: string }[] }) => {
        const loaded = data.models ?? [];
        setGpuModel(loaded.length > 0 ? loaded[0].name : null);
      })
      .catch(() => {
        setGpuModel(null);
      });
  }, []);

  // Auto-refresh GPU model every 10s
  useEffect(() => {
    fetchGpuModel();
    const id = setInterval(fetchGpuModel, 10_000);
    return () => clearInterval(id);
  }, [fetchGpuModel]);

  // Clear GPU — unload all loaded models from Ollama
  const handleClearGpu = useCallback(async () => {
    try {
      const psRes = await fetch('http://localhost:11434/api/ps');
      const psData: { models?: { name: string }[] } = await psRes.json();
      const loaded = psData.models ?? [];
      for (const m of loaded) {
        await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m.name, prompt: '', stream: false, keep_alive: '0' }),
        });
      }
      console.info('[Zuberi] GPU cleared — unloaded', loaded.length, 'models');
      fetchGpuModel(); // refresh indicator
    } catch (err) {
      console.error('[Zuberi] Failed to clear GPU:', err);
    }
  }, [fetchGpuModel]);

  // ── Auto-resize textarea: 1 line → max ~6 lines, then scroll ──
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    const maxH = 132; // ~6 lines at 22px line-height
    const sh = node.scrollHeight;
    node.style.height = `${Math.min(sh, maxH)}px`;
    node.style.overflowY = sh > maxH ? 'auto' : 'hidden';
  }, [draft]);

  // ── File attachment helpers ─────────────────────────────────────
  const processFiles = useCallback((fileList: FileList) => {
    const newFiles: QueuedFile[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      status: 'pending' as const,
    }));
    setQueuedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueuedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /** Read file as ArrayBuffer, invoke save_upload, then sync_to_ceg */
  const uploadFile = useCallback(async (qf: QueuedFile): Promise<string | null> => {
    setQueuedFiles((prev) =>
      prev.map((f) => (f.id === qf.id ? { ...f, status: 'uploading' as const } : f)),
    );
    try {
      const buf = await qf.file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buf));
      const localPath = await invoke<string>('save_upload', {
        filename: qf.name,
        contents: bytes,
      });
      setQueuedFiles((prev) =>
        prev.map((f) => (f.id === qf.id ? { ...f, status: 'done' as const, localPath } : f)),
      );
      // Fire CEG sync in background (best-effort)
      invoke<string>('sync_to_ceg', { localPath }).catch((err) => {
        console.error('[Zuberi] CEG sync failed for', qf.name, err);
      });
      return localPath;
    } catch (err) {
      console.error('[Zuberi] Upload failed for', qf.name, err);
      setQueuedFiles((prev) =>
        prev.map((f) => (f.id === qf.id ? { ...f, status: 'error' as const } : f)),
      );
      return null;
    }
  }, []);

  // ── Drag & drop handlers ──────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  // ── Paste handler (images from clipboard) ─────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const fileItems: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) fileItems.push(file);
        }
      }
      if (fileItems.length > 0) {
        // Create a DataTransfer-like FileList from the collected files
        const dt = new DataTransfer();
        fileItems.forEach((f) => dt.items.add(f));
        processFiles(dt.files);
      }
      // Don't preventDefault — let text paste still work
    },
    [processFiles],
  );

  // Map WebSocket connectionState to ConnectionStatus prop
  // - Token loading (gatewayToken===null) → 'connecting' (not disconnected)
  // - First connect attempt → 'connecting'
  // - After any failure (reconnecting) → 'disconnected' (show crack once)
  // - Max attempts reached (disconnected) → 'disconnected'
  const connStatus = useMemo<'connecting' | 'connected' | 'disconnected'>(() => {
    let mapped: 'connecting' | 'connected' | 'disconnected';
    if (connectionState === 'connected') {
      mapped = 'connected';
    } else if (gatewayToken === null) {
      // Token still loading — show connecting animation
      mapped = 'connecting';
    } else if (connectionState === 'connecting') {
      mapped = 'connecting';
    } else {
      // 'reconnecting' or 'disconnected' → show as disconnected
      mapped = 'disconnected';
    }
    console.info(`[OpenClaw] connectionState=${connectionState} token=${gatewayToken ? 'loaded' : 'null'} → connStatus=${mapped}`);
    return mapped;
  }, [connectionState, gatewayToken]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    const hasFiles = queuedFiles.length > 0;
    if (!text && !hasFiles) return;

    // Upload all pending files first
    const attachRefs: string[] = [];
    if (hasFiles) {
      const pendingFiles = queuedFiles.filter((f) => f.status === 'pending' || f.status === 'error');
      for (const qf of pendingFiles) {
        const localPath = await uploadFile(qf);
        if (localPath) {
          // Extract just the uploads/filename part for the text reference
          const uploadsIdx = localPath.replace(/\\/g, '/').lastIndexOf('uploads/');
          const ref = uploadsIdx >= 0 ? localPath.replace(/\\/g, '/').slice(uploadsIdx) : qf.name;
          attachRefs.push(`[Attached: ${ref}]`);
        }
      }
    }

    // Build the message with attachment references
    const attachBlock = attachRefs.length > 0 ? '\n' + attachRefs.join('\n') : '';
    const message = text + attachBlock;

    if (!message.trim()) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    };

    setMessages((current) => [...current, userMessage]);

    // Reset streaming state for the new response
    const runId = crypto.randomUUID();
    activeRunIdRef.current = runId;
    streamingMessageIdRef.current = null;

    // Send as OpenClaw RPC: chat.send
    const requestId = crypto.randomUUID();
    pendingRequestIdsRef.current.add(requestId);
    const frame = {
      type: 'req' as const,
      id: requestId,
      method: 'chat.send',
      params: {
        sessionKey: SESSION_KEY,
        message,
        idempotencyKey: runId,
        deliver: false,
      },
    };
    console.info('[OpenClaw] SEND chat.send →', JSON.stringify(frame));
    console.info('[OpenClaw] SEND state: connectionState=%s handshakeComplete=%s', connectionState, handshakeComplete);
    send(frame);

    setDraft('');
    setQueuedFiles([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <div
      className="mx-auto flex h-full w-full max-w-4xl flex-col px-6"
      style={{ overflow: 'visible', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Full-area drag overlay ── */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(14, 13, 12, 0.88)',
            border: '2px dashed #f0a020',
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: '#f0a020', fontSize: 16, fontWeight: 500 }}>
            Drop files here to add to chat
          </span>
        </div>
      )}

      {/* ── Logo / Connection Status (right-click for context menu) ── */}
      <ZuberiContextMenu onNewConversation={handleNewConversation}>
        <div style={{ paddingTop: 40, flexShrink: 0, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ConnectionStatus status={connStatus} />
        </div>
      </ZuberiContextMenu>

      {/* ── Messages ── */}
      <div className="ghost-messages flex-1 overflow-y-auto px-4" style={{ background: 'transparent' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                textAlign: message.role === 'user' ? 'right' : 'left',
                color: message.role === 'user' ? '#f0a020' : '#eae9e9',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                maxWidth: '85%',
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message.content}
            </div>
          ))}
        </div>
      </div>

      {/* ── Chat Input (Claude Code style) with drag-drop zone ── */}
      <form
        onSubmit={handleSubmit}
        style={{ flexShrink: 0, paddingBottom: 16, paddingTop: 8 }}
      >
        <div className="mx-auto max-w-3xl">
          {/* Unified input + toolbar container — single rounded box */}
          <div
            data-rounded
            className="overflow-hidden border"
            style={{
              borderColor: '#3a3938',
              transition: 'border-color 150ms',
            }}
          >
            {/* Row 1 — Input field + send button */}
            <div className="relative bg-[#2b2a28]" style={{ padding: '12px 14px 8px' }}>
              {/* File chips (above the textarea when files are queued) */}
              <FileChips files={queuedFiles} onRemove={removeFile} />

              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  placeholder="Reply..."
                  className="flex-1 resize-none border-none bg-transparent text-sm text-[#e6dbcb] placeholder:text-[#7a7977] outline-none focus:ring-0 focus-visible:ring-0"
                  style={{ minHeight: '22px', maxHeight: '132px', lineHeight: '22px', userSelect: 'text' }}
                />
                {/* Send button — coral circle, inside input row */}
                <button
                  type="submit"
                  disabled={!draft.trim() && queuedFiles.length === 0}
                  aria-label="Send"
                  className="btn-circle mb-px flex h-7 w-7 shrink-0 items-center justify-center transition-colors disabled:opacity-30"
                  style={{
                    backgroundColor: (!draft.trim() && queuedFiles.length === 0) ? '#4a4947' : '#D9654B',
                  }}
                >
                  <ArrowUp size={14} color="#ffffff" />
                </button>
              </div>

            </div>

            {/* Row 2 — Controls toolbar, visually connected */}
            <div
              className="flex items-center gap-2 bg-[#2b2a28] px-3 py-1.5"
              style={{ borderTop: '1px solid #3a3938' }}
            >
              <AttachButton onFiles={processFiles} />
              <ModeSelector send={send} sessionKey={SESSION_KEY} />
              <div className="ml-auto">
                <ModelSelector
                  send={send}
                  isConnected={handshakeComplete}
                  sessionKey={SESSION_KEY}
                  models={models}
                  onClearGpu={handleClearGpu}
                  onOpen={fetchModels}
                  onModelLoaded={fetchGpuModel}
                />
              </div>
            </div>
          </div>

          {/* Status bar — working directory + GPU model */}
          <div className="mt-1 flex items-center justify-between px-1" style={{ fontSize: 10, color: '#666564' }}>
            <div className="flex items-center gap-1">
              <Monitor size={10} className="shrink-0 text-[#666564]" />
              <span className="truncate" style={{ maxWidth: 300 }}>C:\</span>
            </div>
            <div className="flex items-center gap-1">
              <Cpu size={10} className={gpuModel ? 'text-[#4ade80]' : 'text-[#666564]'} />
              <span style={{ color: gpuModel ? '#4ade80' : '#666564' }}>
                {gpuModel ?? 'no model'}
              </span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
