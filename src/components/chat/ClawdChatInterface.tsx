import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/chat/ConnectionStatus';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { ModeSelector } from '@/components/chat/ModeSelector';
import { GpuStatus } from '@/components/chat/GpuStatus';

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
    unlisteners.push(
      listen('new-conversation', () => {
        setMessages([]);
        setDraft('');
        activeRunIdRef.current = null;
        streamingMessageIdRef.current = null;
        pendingRequestIdsRef.current.clear();
        console.info('[Zuberi] New conversation started');
      }),
    );

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
  }, []);

  // Build WebSocket URL with token query param for gateway auth
  const wsUrl = useMemo(() => {
    if (!gatewayToken) return 'ws://127.0.0.1:18789';
    const url = `ws://127.0.0.1:18789?token=${encodeURIComponent(gatewayToken)}`;
    // Log URL with redacted token (last 4 chars only)
    const last4 = gatewayToken.slice(-4);
    console.info(`[OpenClaw] WebSocket URL: ws://127.0.0.1:18789?token=...${last4}`);
    return url;
  }, [gatewayToken]);

  const { send, connectionState } = useWebSocket({
    autoConnect: gatewayToken !== null,
    url: wsUrl,
    onOpen: gatewayToken ? buildConnectRequest(gatewayToken) : undefined,
    onConnected: () => {
      handshakeCompleteRef.current = false;
      setHandshakeComplete(false);
    },
    onMessage: (message) => {
      // ── Handle connect handshake ──────────────────────────────────
      if (message.type === 'res' && !handshakeCompleteRef.current) {
        if (message.ok) {
          handshakeCompleteRef.current = true;
          setHandshakeComplete(true);
          console.info('[OpenClaw] Gateway handshake complete');
        } else {
          console.error('[OpenClaw] Gateway handshake failed:', message.error);
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
          if (typeof text !== 'string') return;

          setMessages((current) => {
            if (!streamingMessageIdRef.current) {
              const id = crypto.randomUUID();
              streamingMessageIdRef.current = id;
              return [...current, { id, role: 'assistant', content: text }];
            }
            // OpenClaw sends cumulative text in deltas — replace, don't append
            return current.map((entry) =>
              entry.id === streamingMessageIdRef.current ? { ...entry, content: text } : entry,
            );
          });
        } else if (state === 'final') {
          // Replace streaming message with final content if present
          const text = extractTextFromMessage(payload.message);
          if (text && streamingMessageIdRef.current) {
            setMessages((current) =>
              current.map((entry) =>
                entry.id === streamingMessageIdRef.current ? { ...entry, content: text } : entry,
              ),
            );
          } else if (text && !streamingMessageIdRef.current) {
            // Non-streaming final (e.g. command responses)
            setMessages((current) => [
              ...current,
              { id: crypto.randomUUID(), role: 'assistant', content: text },
            ]);
          }
          activeRunIdRef.current = null;
          streamingMessageIdRef.current = null;
        } else if (state === 'error') {
          const errText = payload.errorMessage ?? 'An error occurred';
          setMessages((current) => [
            ...current,
            { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${errText}` },
          ]);
          activeRunIdRef.current = null;
          streamingMessageIdRef.current = null;
        } else if (state === 'aborted') {
          // Keep whatever was streamed so far
          activeRunIdRef.current = null;
          streamingMessageIdRef.current = null;
        }
        return;
      }

      // ── Handle agent streaming events ─────────────────────────────
      // Agent events carry cumulative text in { data: { text, delta } }
      if (message.type === 'event' && message.event === 'agent') {
        const payload = message.payload as Record<string, unknown> | undefined;
        if (!payload) return;

        const text = extractTextFromMessage(payload);
        if (typeof text !== 'string') return;

        setMessages((current) => {
          if (!streamingMessageIdRef.current) {
            const id = crypto.randomUUID();
            streamingMessageIdRef.current = id;
            return [...current, { id, role: 'assistant', content: text }];
          }
          return current.map((entry) =>
            entry.id === streamingMessageIdRef.current ? { ...entry, content: text } : entry,
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
    } catch (err) {
      console.error('[Zuberi] Failed to clear GPU:', err);
    }
  }, []);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;

    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [draft]);

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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;

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
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-6" style={{ overflow: 'visible' }}>
      <div style={{ paddingTop: 40, flexShrink: 0, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ConnectionStatus status={connStatus} />
      </div>
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

      <form onSubmit={handleSubmit} style={{ flexShrink: 0, paddingBottom: 12, paddingTop: 8 }}>
        <div className="border border-[#4a4947] bg-[#31302e] p-3">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            className="max-h-[200px] min-h-[44px] resize-none border-none bg-transparent px-0 text-sm text-[#e6dbcb] placeholder:text-[#b0afae] focus-visible:ring-0"
            style={{ userSelect: 'text' }}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <ModeSelector send={send} sessionKey={SESSION_KEY} />
            <div className="flex items-center gap-3">
              <GpuStatus />
              <ModelSelector
                send={send}
                isConnected={handshakeComplete}
                sessionKey={SESSION_KEY}
                models={models}
                onClearGpu={handleClearGpu}
                onOpen={fetchModels}
              />
              <Button type="submit" disabled={!draft.trim()} className="rounded-none bg-[#e6dbcb] text-[#1f1f1d] hover:bg-[#d5cbbd]">
                Send
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
