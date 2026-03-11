import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowUp, Cpu, LayoutGrid } from 'lucide-react';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/chat/ConnectionStatus';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { ModeSelector } from '@/components/chat/ModeSelector';
import { MessageContent } from '@/components/chat/MessageContent';
import { CopyButton } from '@/components/chat/CopyButton';
// GpuStatus removed from toolbar — component kept for future use
import { ZuberiContextMenu } from '@/components/layout/ZuberiContextMenu';
import { AttachButton, FileChips, type QueuedFile } from '@/components/chat/FileAttachments';
import { ToolApprovalCard } from '@/components/chat/ToolApprovalCard';
import { ContextMeter } from '@/components/chat/ContextMeter';
import { ensureEnvironment } from '@/lib/ollama';
import type { ContentBlock, ChatMessage } from '@/types/message';
import type { ApprovalDecision, ApprovalRecord, ApprovalStatus, PermissionMode } from '@/types/permissions';
import { PERMISSION_MODE_TO_EXEC_ASK } from '@/types/permissions';
import { normalizeApprovalRequest, resolveApprovalDecision } from '@/lib/permissionPolicy';

const SESSION_KEY = 'agent:main:main';

// ── Sentinel / control output filtering ────────────────────────────
// These tokens are internal control outputs that must never render as visible
// assistant content.  The backend (OpenClaw) has its own suppression for some
// of these, but the frontend filters defensively as a second layer.
const SENTINEL_EXACT = new Set(['NO', 'NO_REPLY', 'HEARTBEAT_OK']);

/**
 * Returns true if `text` is a known internal sentinel/control output that
 * should be suppressed from visible chat.
 *
 * Matches:
 *  - Exact tokens: NO, NO_REPLY, HEARTBEAT_OK (trimmed, case-sensitive)
 *  - HEARTBEAT_OK prefix: "HEARTBEAT_OK. …" (heartbeat with appended text)
 */
function isSentinelOutput(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (SENTINEL_EXACT.has(trimmed)) return true;
  // Heartbeat token can appear as prefix with trailing content
  if (trimmed.startsWith('HEARTBEAT_OK')) return true;
  return false;
}

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

/**
 * Extract structured content blocks from an OpenClaw message.
 * Returns undefined if the message doesn't contain a structured content array.
 * Preserves toolCall/toolResult blocks instead of flattening to text.
 */
function extractContentBlocks(message: unknown): ContentBlock[] | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const m = message as Record<string, unknown>;
  if (!Array.isArray(m.content)) return undefined;

  const blocks: ContentBlock[] = [];
  for (const block of m.content) {
    if (typeof block === 'string') {
      blocks.push({ type: 'text', text: block });
      continue;
    }
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;

    if (b.type === 'text' && typeof b.text === 'string') {
      blocks.push({ type: 'text', text: b.text });
    } else if (b.type === 'toolCall' || b.type === 'tool_call') {
      blocks.push({
        type: 'toolCall',
        toolName: typeof b.toolName === 'string'
          ? b.toolName
          : typeof b.name === 'string'
            ? b.name
            : 'unknown',
        args: (b.args && typeof b.args === 'object')
          ? b.args as Record<string, unknown>
          : (b.input && typeof b.input === 'object')
            ? b.input as Record<string, unknown>
            : undefined,
        id: typeof b.id === 'string' ? b.id : undefined,
      });
    } else if (b.type === 'toolResult' || b.type === 'tool_result') {
      blocks.push({
        type: 'toolResult',
        toolName: typeof b.toolName === 'string'
          ? b.toolName
          : typeof b.name === 'string'
            ? b.name
            : 'unknown',
        text: typeof b.text === 'string'
          ? b.text
          : typeof b.content === 'string'
            ? b.content
            : JSON.stringify(b),
        id: typeof b.id === 'string' ? b.id : undefined,
      });
    } else if (typeof b.text === 'string') {
      // Unknown block type with text — treat as text
      blocks.push({ type: 'text', text: b.text });
    }
  }

  // Only return blocks if we found structured content (not just plain text blocks)
  const hasStructured = blocks.some((b) => b.type !== 'text');
  return hasStructured ? blocks : undefined;
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
  // Ollama health state
  const [ollamaDown, setOllamaDown] = useState(false);

  // ── Permission mode state ───────────────────────────────────────
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(() => {
    const stored = localStorage.getItem('zuberi-permission-mode');
    if (stored === 'ask' || stored === 'auto' || stored === 'plan' || stored === 'bypass') {
      return stored;
    }
    return 'ask';
  });
  const permissionModeRef = useRef<PermissionMode>(permissionMode);
  // Track pending approvals by ID
  const approvalsRef = useRef<Map<string, ApprovalRecord>>(new Map());
  // Track approval timeout timers for cleanup
  const approvalTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Reactive state for approval cards that need UI (decision === 'ask')
  const [pendingApprovals, setPendingApprovals] = useState<Map<string, ApprovalRecord>>(new Map());

  // ── Context meter: token usage in the 131K context window ─────────
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  // Track outstanding sessions.get RPC so we can match its response
  const pendingSessionGetIdRef = useRef<string | null>(null);

  // ── New Conversation handler (shared between menu event and context menu) ──
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setDraft('');
    setQueuedFiles([]);
    activeRunIdRef.current = null;
    streamingMessageIdRef.current = null;
    pendingRequestIdsRef.current.clear();
    // Clear all approval timers and state
    for (const timer of approvalTimersRef.current.values()) {
      clearTimeout(timer);
    }
    approvalTimersRef.current.clear();
    approvalsRef.current.clear();
    setPendingApprovals(new Map());
    setTokenCount(null);
    pendingSessionGetIdRef.current = null;
    console.info('[Zuberi] New conversation started');
  }, []);

  // Sync permissionModeRef whenever state changes
  useEffect(() => {
    permissionModeRef.current = permissionMode;
  }, [permissionMode]);

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

      // ── Handle sessions.get response (context meter token data) ────
      if (
        message.type === 'res' &&
        typeof message.id === 'string' &&
        message.id === pendingSessionGetIdRef.current
      ) {
        pendingSessionGetIdRef.current = null;
        pendingRequestIdsRef.current.delete(message.id);
        if (message.ok) {
          const result = message.result as Record<string, unknown> | undefined;
          if (result) {
            // Look for totalTokens at the top level or inside a nested session object
            const session = (result.session ?? result) as Record<string, unknown>;
            const total = typeof session.totalTokens === 'number' ? session.totalTokens : null;
            if (total !== null) {
              setTokenCount(total);
            }
          }
        }
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

          // ── Sentinel suppression (RTL-051) ──
          // Suppress control outputs like NO, NO_REPLY, HEARTBEAT_OK.
          // Cumulative deltas that are ONLY a sentinel token are suppressed.
          // If the model is mid-stream building "Not a problem…", the next
          // delta will no longer match and rendering will proceed normally.
          if (isSentinelOutput(text)) {
            console.warn('[RTL-051] Sentinel suppressed in delta:', JSON.stringify(text));
            return;
          }

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
          const blocks = extractContentBlocks(payload.message);
          console.info('[WS:FINAL]', { text, blocks: blocks?.length, streamingId: streamingMessageIdRef.current, rawMessage: JSON.stringify(payload.message ?? null).slice(0, 300) });

          // ── Sentinel suppression on final (RTL-051) ──
          // If the final text is a sentinel/control output, remove any
          // partially-streamed message and reset refs without rendering.
          if (isSentinelOutput(text)) {
            console.warn('[RTL-051] Sentinel suppressed in final:', JSON.stringify(text),
              '| runId:', payload.runId, '| streamingId:', streamingMessageIdRef.current);
            // Remove the streaming placeholder if one was created
            if (streamingMessageIdRef.current) {
              const deadId = streamingMessageIdRef.current;
              setMessages((current) => current.filter((entry) => entry.id !== deadId));
            }
            activeRunIdRef.current = null;
            streamingMessageIdRef.current = null;
            return;
          }

          if (text && streamingMessageIdRef.current) {
            const finalStreamId = streamingMessageIdRef.current;
            setMessages((current) =>
              current.map((entry) =>
                entry.id === finalStreamId ? { ...entry, content: text, blocks } : entry,
              ),
            );
          } else if (text && !streamingMessageIdRef.current) {
            // Non-streaming final (e.g. command responses)
            setMessages((current) => [
              ...current,
              { id: crypto.randomUUID(), role: 'assistant', content: text, blocks },
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

        // ── Sentinel suppression in agent stream (RTL-051) ──
        if (isSentinelOutput(text)) {
          console.warn('[RTL-051] Sentinel suppressed in agent event:', JSON.stringify(text));
          return;
        }

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

      // ── Handle exec.approval.requested ──────────────────────────
      if (message.type === 'event' && message.event === 'exec.approval.requested') {
        const payload = message.payload as Record<string, unknown> | undefined;
        if (!payload) return;

        const approvalId = typeof payload.id === 'string' ? payload.id : null;
        if (!approvalId) {
          console.warn('[Zuberi] exec.approval.requested missing id:', payload);
          return;
        }

        // Deduplicate
        if (approvalsRef.current.has(approvalId)) return;

        const request = (payload.request ?? payload) as Record<string, unknown>;
        const normalized = normalizeApprovalRequest(request);
        const decision = resolveApprovalDecision(permissionModeRef.current, normalized);

        const now = Date.now();
        const expiresAtMs = typeof payload.expiresAt === 'number'
          ? payload.expiresAt
          : now + 120_000;

        const record: ApprovalRecord = {
          id: approvalId,
          command: normalized.command,
          commandArgv: normalized.args.length > 0
            ? [normalized.command, ...normalized.args]
            : undefined,
          cwd: normalized.cwd,
          host: normalized.host,
          category: normalized.category,
          status: 'pending',
          decisionSource: decision === 'ask' ? 'user' : 'auto',
          createdAtMs: now,
          expiresAtMs,
        };

        if (decision !== 'ask') {
          // Auto-resolve: send RPC immediately
          const resolveId = crypto.randomUUID();
          pendingRequestIdsRef.current.add(resolveId);
          sendRef.current({
            type: 'req',
            id: resolveId,
            method: 'exec.approval.resolve',
            params: { id: approvalId, decision },
          });
          record.status = (decision === 'deny' ? 'auto_denied' : 'auto_approved') as ApprovalStatus;
          console.info(`[Zuberi] Auto-resolved approval ${approvalId}: ${decision} (${normalized.category} → ${normalized.command})`);
        } else {
          record.status = 'pending';
          console.info(`[Zuberi] Approval pending ${approvalId}: ${normalized.command} (${normalized.category})`);

          // Set up timeout
          const remaining = expiresAtMs - now;
          if (remaining <= 0) {
            record.status = 'expired';
          } else {
            const timer = setTimeout(() => {
              const existing = approvalsRef.current.get(approvalId);
              if (existing && existing.status === 'pending') {
                existing.status = 'expired';
                console.warn(`[Zuberi] Approval expired: ${approvalId}`);
                // Update reactive state so UI re-renders
                setPendingApprovals(prev => {
                  const next = new Map(prev);
                  next.set(approvalId, { ...existing });
                  return next;
                });
              }
              approvalTimersRef.current.delete(approvalId);
            }, remaining);
            approvalTimersRef.current.set(approvalId, timer);
          }

          // Add to reactive state for UI rendering
          setPendingApprovals(prev => {
            const next = new Map(prev);
            next.set(approvalId, { ...record });
            return next;
          });
        }

        approvalsRef.current.set(approvalId, record);
        return;
      }

      // ── Handle exec.approval.resolved ─────────────────────────
      if (message.type === 'event' && message.event === 'exec.approval.resolved') {
        const payload = message.payload as Record<string, unknown> | undefined;
        if (!payload) return;

        const approvalId = typeof payload.id === 'string' ? payload.id : null;
        if (!approvalId) return;

        const existing = approvalsRef.current.get(approvalId);
        if (existing) {
          const resolvedDecision = typeof payload.decision === 'string' ? payload.decision : null;
          if (resolvedDecision === 'allow-once' || resolvedDecision === 'allow-always') {
            existing.status = existing.decisionSource === 'auto' ? 'auto_approved' : 'approved';
          } else if (resolvedDecision === 'deny') {
            existing.status = existing.decisionSource === 'auto' ? 'auto_denied' : 'denied';
          }

          // Clear timeout timer
          const timer = approvalTimersRef.current.get(approvalId);
          if (timer) {
            clearTimeout(timer);
            approvalTimersRef.current.delete(approvalId);
          }

          // Update reactive state if this was a user-facing approval card
          if (existing.decisionSource === 'user') {
            setPendingApprovals(prev => {
              const next = new Map(prev);
              next.set(approvalId, { ...existing });
              return next;
            });
          }

          console.info(`[Zuberi] Approval resolved ${approvalId}: ${resolvedDecision}`);
        }
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

  // Ensure environment on mount: Ollama → model check → OpenClaw health
  useEffect(() => {
    let cancelled = false;
    ensureEnvironment()
      .then((result) => {
        if (cancelled) return;
        if (result.ollama === 'failed' || result.ollama.startsWith('error')) {
          console.warn('[Zuberi] Ollama is not running:', result.ollama);
          setOllamaDown(true);
          return;
        }
        setOllamaDown(false);
        console.info('[Zuberi] Ollama is live');
        fetchModels();
        if (result.model.startsWith('error')) {
          console.warn('[Zuberi] Model check failed:', result.model);
        } else {
          console.info('[Zuberi] Model check:', result.model);
        }
        if (result.openclaw === 'openclaw_unhealthy') {
          console.warn('[Zuberi] OpenClaw unhealthy on startup');
        } else {
          console.info('[Zuberi] OpenClaw:', result.openclaw);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Zuberi] ensureEnvironment failed:', err);
        setOllamaDown(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh models every 30s (only when handshake is complete)
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

  // ── Retry Ollama handler (for ModelSelector recovery UI) ──
  const handleRetryOllama = useCallback(async () => {
    setOllamaDown(false); // optimistic
    try {
      const result = await ensureEnvironment();
      if (result.ollama === 'failed' || result.ollama.startsWith('error')) {
        console.warn('[Zuberi] Ollama retry failed:', result.ollama);
        setOllamaDown(true);
      } else {
        console.info('[Zuberi] Ollama launched via retry');
        setOllamaDown(false);
        fetchModels();
      }
    } catch (err) {
      console.error('[Zuberi] ensureEnvironment retry failed:', err);
      setOllamaDown(true);
    }
  }, [fetchModels]);

  // ── Fetch session token usage for context meter ────────────────
  const fetchSessionTokens = useCallback(() => {
    if (!handshakeCompleteRef.current) return;
    const reqId = crypto.randomUUID();
    pendingSessionGetIdRef.current = reqId;
    pendingRequestIdsRef.current.add(reqId);
    sendRef.current({
      type: 'req',
      id: reqId,
      method: 'sessions.get',
      params: { sessionKey: SESSION_KEY },
    });
  }, []);

  // Poll session tokens: on handshake + every 30s
  useEffect(() => {
    if (!handshakeComplete) return;
    // Initial fetch
    fetchSessionTokens();
    const id = setInterval(fetchSessionTokens, 30_000);
    return () => clearInterval(id);
  }, [handshakeComplete, fetchSessionTokens]);

  // ── Permission mode change handler ────────────────────────────
  const handlePermissionModeChange = useCallback((newMode: PermissionMode) => {
    setPermissionMode(newMode);
    permissionModeRef.current = newMode;
    localStorage.setItem('zuberi-permission-mode', newMode);

    // Send sessions.patch to backend with mapped execAsk value
    const execAsk = PERMISSION_MODE_TO_EXEC_ASK[newMode];
    const patchId = crypto.randomUUID();
    pendingRequestIdsRef.current.add(patchId);
    send({
      type: 'req',
      id: patchId,
      method: 'sessions.patch',
      params: {
        sessionKey: SESSION_KEY,
        patch: { execAsk },
      },
    });
    console.info(`[Zuberi] Permission mode → ${newMode} (execAsk: ${execAsk})`);
  }, [send]);

  // ── Approval decision handler (user clicks Allow/Deny on ToolApprovalCard) ──
  const handleApprovalDecision = useCallback((id: string, decision: ApprovalDecision) => {
    const existing = approvalsRef.current.get(id);
    if (!existing || existing.status !== 'pending') return;

    // Mark as resolving
    existing.status = 'resolving';

    // Send exec.approval.resolve RPC
    const resolveId = crypto.randomUUID();
    pendingRequestIdsRef.current.add(resolveId);
    sendRef.current({
      type: 'req',
      id: resolveId,
      method: 'exec.approval.resolve',
      params: { id, decision },
    });

    // Clear the timeout timer
    const timer = approvalTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      approvalTimersRef.current.delete(id);
    }

    // Update reactive state so card shows "Resolving…"
    setPendingApprovals(prev => {
      const next = new Map(prev);
      next.set(id, { ...existing });
      return next;
    });

    console.info(`[Zuberi] User decision for ${id}: ${decision}`);
  }, []);

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
    console.info('[RTL-051:SEND] chat.send payload:', JSON.stringify(frame));
    console.info('[RTL-051:SEND] runClassification=user-chat, deliver=%s, sessionKey=%s, connectionState=%s, handshakeComplete=%s',
      frame.params.deliver, frame.params.sessionKey, connectionState, handshakeComplete);
    send(frame);

    // Refresh context meter after sending (slight delay for backend to update)
    setTimeout(fetchSessionTokens, 2000);

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
      className="mx-auto flex h-full w-full max-w-[1075px] flex-col px-6"
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
            border: '2px dashed var(--ember)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: 'var(--ember)', fontSize: 16, fontWeight: 500 }}>
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
              className="msg-bubble"
              style={{
                textAlign: 'left',
                color: message.role === 'user' ? 'var(--text-primary)' : 'var(--text-ember)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                maxWidth: '85%',
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                position: 'relative',
              }}
            >
              <CopyButton text={message.content} />
              <MessageContent
                content={message.content}
                blocks={message.blocks}
                role={message.role}
              />
            </div>
          ))}

          {/* ── Pending Approval Cards ── */}
          {pendingApprovals.size > 0 &&
            Array.from(pendingApprovals.values()).map((record) => (
              <div
                key={record.id}
                style={{ alignSelf: 'flex-start', maxWidth: '85%' }}
              >
                <ToolApprovalCard
                  record={record}
                  onDecision={handleApprovalDecision}
                />
              </div>
            ))}
        </div>
      </div>

      {/* ── Chat Input (Claude Code style) with drag-drop zone ── */}
      <form
        onSubmit={handleSubmit}
        style={{ flexShrink: 0, paddingBottom: 16, paddingTop: 8 }}
      >
        <div className="mx-auto max-w-[920px]">
          {/* Unified input + toolbar container — single rounded box */}
          <div
            className="overflow-hidden border"
            style={{
              borderColor: 'var(--surface-interactive)',
              transition: 'border-color 150ms',
            }}
          >
            {/* Row 1 — Input field + send button */}
            <div className="relative bg-[var(--surface-2)]" style={{ padding: '12px 14px 8px' }}>
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
                  className="chat-input flex-1 resize-none border-none bg-transparent text-sm outline-none focus:ring-0 focus-visible:ring-0"
                  style={{ minHeight: '22px', maxHeight: '132px', lineHeight: '22px', userSelect: 'text' }}
                />
                {/* Send button — coral circle, inside input row */}
                <button
                  type="submit"
                  disabled={!draft.trim() && queuedFiles.length === 0}
                  aria-label="Send"
                  className="btn-circle mb-px flex h-7 w-7 shrink-0 items-center justify-center transition-colors disabled:opacity-30"
                  style={{
                    backgroundColor: (!draft.trim() && queuedFiles.length === 0) ? 'var(--surface-interactive-hover)' : 'var(--send-bg)',
                  }}
                >
                  <ArrowUp size={14} color="#ffffff" />
                </button>
              </div>

            </div>

            {/* Row 2 — Controls toolbar, visually connected */}
            <div
              className="flex items-center gap-2 bg-[var(--surface-2)] px-3 py-1.5"
              style={{ borderTop: '1px solid var(--surface-interactive)' }}
            >
              <AttachButton onFiles={processFiles} />
              <ModeSelector mode={permissionMode} onModeChange={handlePermissionModeChange} />
              <ContextMeter tokenCount={tokenCount} />
              <div className="ml-auto">
                <ModelSelector
                  send={send}
                  isConnected={handshakeComplete}
                  sessionKey={SESSION_KEY}
                  models={models}
                  onClearGpu={handleClearGpu}
                  onOpen={fetchModels}
                  onModelLoaded={fetchGpuModel}
                  ollamaDown={ollamaDown}
                  onRetryOllama={handleRetryOllama}
                />
              </div>
            </div>
          </div>

          {/* Status bar — Kanban + GPU model */}
          <div className="mt-1 flex items-center justify-between px-1" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            <button
              onClick={() => invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' }).catch(console.error)}
              className="flex items-center gap-1"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '1px 4px', fontSize: 10 }}
              title="Kanban Board"
            >
              <LayoutGrid size={10} />
              <span>Kanban</span>
            </button>
            <div className="flex items-center gap-1">
              <Cpu size={10} style={{ color: gpuModel ? 'var(--status-success)' : 'var(--text-muted)' }} />
              <span style={{ color: gpuModel ? 'var(--status-success)' : 'var(--text-muted)' }}>
                {gpuModel ?? 'no model'}
              </span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
