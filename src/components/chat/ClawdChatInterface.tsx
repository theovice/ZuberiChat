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

// ── Command signature dedup (Tier 2) ─────────────────────────────
// The gateway generates a NEW UUID for every tool-call retry. UUID-only dedup
// (approvalsRef) lets retries for the same command create multiple cards.
// This module-level Map tracks pending command signatures so only ONE card
// shows per unique command, regardless of how many UUIDs the gateway generates.
const pendingCommandSignatures = new Map<string, { latestId: string; allIds: string[] }>();

function computeCommandSignature(command: string, commandArgv: string[]): string {
  return command + '\0' + commandArgv.join('\0');
}

type ModelEntry = { id: string; name: string; parameterSize?: string; family?: string };

// v1.0.20: Device identity for Ed25519 challenge-response handshake
interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

function buildConnectRequest(token: string, device?: DeviceIdentity): WebSocketMessage {
  const params: Record<string, unknown> = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'openclaw-control-ui',
      version: '1.0.22',
      platform: 'Win32',
      mode: 'webchat',
    },
    role: 'operator',
    scopes: [
      'operator.admin',
      'operator.approvals',
      'operator.pairing',
      'operator.read',
      'operator.write',
    ],
    caps: ['tool-events', 'structured-commands'],
    auth: { token },
    userAgent: navigator.userAgent,
    locale: navigator.language,
  };
  if (device) {
    params.device = {
      id: device.deviceId,
      publicKey: device.publicKey,
      signature: device.signature,
      signedAt: device.signedAt,
      nonce: device.nonce,
    };
  }
  return {
    type: 'req',
    id: crypto.randomUUID(),
    method: 'connect',
    params,
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
  // v1.0.20: Challenge timeout for Ed25519 device identity handshake
  const challengeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v1.0.22: Connection generation counter — prevents stale sign_challenge
  // callbacks from sending a connect RPC with an outdated nonce.
  const connectionGenRef = useRef(0);
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
  // Track outstanding sessions.resolve RPC so we can match its response
  const pendingSessionGetIdRef = useRef<string | null>(null);

  // ── Auto-scroll & scroll-to-bottom button ────────────────────────
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const userHasScrolledUpRef = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const SCROLL_THRESHOLD = 200; // px from bottom to consider "at bottom"

  /** Scroll the message container to the bottom. */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    bottomAnchorRef.current?.scrollIntoView({ behavior });
    userHasScrolledUpRef.current = false;
    setShowScrollBtn(false);
  }, []);

  /** onScroll handler for the message list — detects user scroll-up. */
  const handleMessageScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > SCROLL_THRESHOLD) {
      userHasScrolledUpRef.current = true;
      setShowScrollBtn(true);
    } else {
      userHasScrolledUpRef.current = false;
      setShowScrollBtn(false);
    }
  }, []);

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
    pendingCommandSignatures.clear();
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

  // v1.0.20: Connect to BARE WebSocket URL.  Do NOT send connect RPC on
  // ws.onopen — wait for the gateway's connect.challenge event, sign it
  // with Ed25519 via the Rust backend, then send the connect RPC with a
  // device identity object.  If no challenge arrives within 5 seconds
  // (e.g. dangerouslyDisableDeviceAuth=true), fall back to sending the
  // connect RPC without a device object.
  const wsUrl = 'ws://127.0.0.1:18789';

  const { send, connectionState } = useWebSocket({
    autoConnect: gatewayToken !== null,
    url: wsUrl,
    // v1.0.20: NO onOpen — connect RPC is sent after challenge or timeout
    onConnected: () => {
      handshakeCompleteRef.current = false;
      setHandshakeComplete(false);

      // v1.0.22: Bump connection generation so stale sign_challenge
      // callbacks from previous connections are discarded.
      connectionGenRef.current += 1;

      // Clear any previous challenge timeout
      if (challengeTimeoutRef.current) {
        clearTimeout(challengeTimeoutRef.current);
        challengeTimeoutRef.current = null;
      }

      // Start 5-second fallback timer: if no connect.challenge arrives,
      // send the connect RPC without a device identity object.
      const token = gatewayTokenRef.current;
      if (token) {
        challengeTimeoutRef.current = setTimeout(() => {
          challengeTimeoutRef.current = null;
          if (!handshakeCompleteRef.current) {
            console.warn('[OpenClaw] No connect.challenge received in 5s — sending connect without device identity');
            sendRef.current(buildConnectRequest(token));
          }
        }, 5000);
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
          // v1.0.20: Log granted scopes from the connect response
          const result = message.result as Record<string, unknown> | undefined;
          const granted = result?.scopes ?? result?.grantedScopes;
          if (Array.isArray(granted)) {
            console.info('[OpenClaw] Gateway handshake complete — granted scopes:', granted.join(', '));
            if (!granted.includes('operator.approvals')) {
              console.warn('[OpenClaw] Approval scope not granted — cards will not appear');
            }
          } else {
            console.info('[OpenClaw] Gateway handshake complete (explicit connect)');
          }
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

      // ── Handle connect.challenge (Ed25519 device identity) ──────
      // v1.0.20: Sign the gateway nonce with the device keypair via Rust,
      // then send the connect RPC with the full device identity object.
      if (message.type === 'event' && message.event === 'connect.challenge') {
        // Cancel the fallback timeout — challenge arrived in time
        if (challengeTimeoutRef.current) {
          clearTimeout(challengeTimeoutRef.current);
          challengeTimeoutRef.current = null;
        }

        const token = gatewayTokenRef.current;
        if (!token) {
          console.error('[OpenClaw] Received challenge but no token loaded');
          return;
        }

        const payload = message.payload as Record<string, unknown> | undefined;
        const nonce = (payload?.nonce ?? '') as string;
        // v1.0.22: Capture connection generation at challenge receipt.
        // If the connection cycles before sign_challenge completes,
        // the callback must discard itself to avoid sending a stale nonce.
        const gen = connectionGenRef.current;
        console.info('[OpenClaw] connect.challenge received — signing nonce (gen=%d)', gen);

        invoke<DeviceIdentity>('sign_challenge', {
          nonce,
          token,
          clientId: 'openclaw-control-ui',
          clientMode: 'webchat',
          role: 'operator',
          scopes: 'operator.admin,operator.approvals,operator.pairing,operator.read,operator.write',
          platform: 'win32',
        })
          .then((deviceInfo) => {
            if (connectionGenRef.current !== gen) {
              console.warn('[OpenClaw] Discarding stale sign_challenge result (gen %d → %d)', gen, connectionGenRef.current);
              return;
            }
            console.info('[OpenClaw] Challenge signed — deviceId=%s', deviceInfo.deviceId.slice(0, 16));
            sendRef.current(buildConnectRequest(token, deviceInfo));
          })
          .catch((err) => {
            if (connectionGenRef.current !== gen) return; // stale — silently discard
            console.error('[OpenClaw] Failed to sign challenge:', err);
            // Fall back to connect without device identity
            console.warn('[OpenClaw] Falling back to connect without device identity');
            sendRef.current(buildConnectRequest(token));
          });
        return;
      }

      // ── Handle sessions.resolve response (context meter token data) ──
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
          // Auto-scroll on streaming delta (instant, respects user scroll-up)
          if (!userHasScrolledUpRef.current) {
            requestAnimationFrame(() => scrollToBottom('auto'));
          }
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
            // Only remove streaming placeholder if it also contains sentinel content.
            // If deltas already populated it with real text, keep it.
            if (streamingMessageIdRef.current) {
              const deadId = streamingMessageIdRef.current;
              setMessages((current) => {
                const existing = current.find((entry) => entry.id === deadId);
                if (existing && isSentinelOutput(existing.content)) {
                  return current.filter((entry) => entry.id !== deadId);
                }
                return current;
              });
            }
            // Do NOT clear streamingMessageIdRef — a subsequent real final
            // should update the existing message slot, not create a duplicate.
            activeRunIdRef.current = null;
            return;
          }

          if (text && streamingMessageIdRef.current) {
            // Branch A: update the existing streaming message in place.
            // Keep streamingMessageIdRef pointing to this slot so a second
            // final for the same turn updates it instead of appending a dup.
            const finalStreamId = streamingMessageIdRef.current;
            setMessages((current) =>
              current.map((entry) =>
                entry.id === finalStreamId ? { ...entry, content: text, blocks } : entry,
              ),
            );
          } else if (text && !streamingMessageIdRef.current) {
            // Branch B: no streaming ref — append a new message.
            // Generate ID outside the updater (StrictMode-safe) and store
            // it in streamingMessageIdRef so a second final updates this
            // message instead of appending another duplicate.
            const newMsgId = crypto.randomUUID();
            streamingMessageIdRef.current = newMsgId;
            setMessages((current) => [
              ...current,
              { id: newMsgId, role: 'assistant', content: text, blocks },
            ]);
          }

          // Auto-scroll on final (respects user scroll-up)
          if (!userHasScrolledUpRef.current) {
            requestAnimationFrame(() => scrollToBottom('auto'));
          }

          // Clear activeRunIdRef unconditionally — it serves correlation
          // only and must not survive into the next turn.
          // Do NOT clear streamingMessageIdRef here.  It now intentionally
          // survives across multiple finals within the same turn so that
          // subsequent finals update the same message slot.  The ref is
          // cleared on new-conversation and new-user-message boundaries.
          activeRunIdRef.current = null;
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

        // Share streamingMessageIdRef with chat handler — agent and chat events
        // for the same turn must converge on the same message slot.  Cross-turn
        // contamination is prevented by clearing the ref on user-message submit.
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
        // Auto-scroll on agent stream (respects user scroll-up)
        if (!userHasScrolledUpRef.current) {
          requestAnimationFrame(() => scrollToBottom('auto'));
        }
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

        // Deduplicate by UUID
        if (approvalsRef.current.has(approvalId)) return;

        const request = (payload.request ?? payload) as Record<string, unknown>;
        const normalized = normalizeApprovalRequest(request);
        const decision = resolveApprovalDecision(permissionModeRef.current, normalized);

        // ── Tier 2: Command signature dedup ──
        // The gateway issues a new UUID per retry.  Dedup by command signature
        // so only ONE card renders per unique command.
        const cmdArgv = normalized.args.length > 0
          ? [normalized.command, ...normalized.args]
          : [normalized.command];
        const sig = computeCommandSignature(normalized.command, cmdArgv);
        const existingSig = pendingCommandSignatures.get(sig);

        if (existingSig) {
          // Same command already pending — deny the PREVIOUS UUID so the
          // gateway stops waiting on it, then update the signature to track
          // the new (latest) UUID.
          const prevId = existingSig.latestId;
          const denyId = crypto.randomUUID();
          pendingRequestIdsRef.current.add(denyId);
          sendRef.current({
            type: 'req',
            id: denyId,
            method: 'exec.approval.resolve',
            params: { id: prevId, decision: 'deny' },
          });
          console.info(`[Zuberi] Signature dedup: denied stale UUID ${prevId}, replaced with ${approvalId}`);
          existingSig.latestId = approvalId;
          existingSig.allIds.push(approvalId);
          // Store new UUID in approvalsRef so future UUID-dedup catches it
          approvalsRef.current.set(approvalId, approvalsRef.current.get(prevId)!);
          return;
        }

        const now = Date.now();
        const expiresAtMs = typeof payload.expiresAt === 'number'
          ? payload.expiresAt
          : now + 120_000;

        const record: ApprovalRecord = {
          id: approvalId,
          command: normalized.command,
          commandArgv: cmdArgv.length > 1 ? cmdArgv : undefined,
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
          console.info(`[Zuberi] Auto-resolved approval ${approvalId}: ${decision} (${normalized.category} -> ${normalized.command})`);
        } else {
          record.status = 'pending';
          console.info(`[Zuberi] Approval pending ${approvalId}: ${normalized.command} (${normalized.category})`);

          // Register command signature for dedup
          pendingCommandSignatures.set(sig, { latestId: approvalId, allIds: [approvalId] });

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
                // Tier 3B: Notify the gateway so the agent doesn't hang
                const expDenyId = crypto.randomUUID();
                pendingRequestIdsRef.current.add(expDenyId);
                sendRef.current({
                  type: 'req',
                  id: expDenyId,
                  method: 'exec.approval.resolve',
                  params: { id: approvalId, decision: 'deny' },
                });
                // Clean up signature entry
                pendingCommandSignatures.delete(sig);
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

          // Tier 2D: Clean up command signature entry
          for (const [key, entry] of pendingCommandSignatures) {
            if (entry.allIds.includes(approvalId) || entry.latestId === approvalId) {
              pendingCommandSignatures.delete(key);
              break;
            }
          }

          // Update reactive state if this was a user-facing approval card
          if (existing.decisionSource === 'user') {
            setPendingApprovals(prev => {
              const next = new Map(prev);
              next.set(approvalId, { ...existing });
              return next;
            });

            // Tier 3C: Remove card after 2s visual feedback so user sees
            // "Approved" / "Denied" briefly before it disappears.
            setTimeout(() => {
              setPendingApprovals(prev => {
                const next = new Map(prev);
                next.delete(approvalId);
                return next;
              });
            }, 2000);
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
      method: 'sessions.resolve',
      params: { key: SESSION_KEY },
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
    // Schema: { key (required), execAsk, ... } — flat, no nesting under "patch"
    const execAsk = PERMISSION_MODE_TO_EXEC_ASK[newMode];
    const patchId = crypto.randomUUID();
    pendingRequestIdsRef.current.add(patchId);
    send({
      type: 'req',
      id: patchId,
      method: 'sessions.patch',
      params: {
        key: SESSION_KEY,
        execAsk,
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

    // Tier 2C: Resolve using the LATEST UUID from command signature, not
    // necessarily the one on the card (gateway cares about the most recent).
    let resolveTargetId = id;
    let sigKey: string | null = null;
    for (const [key, entry] of pendingCommandSignatures) {
      if (entry.allIds.includes(id) || entry.latestId === id) {
        resolveTargetId = entry.latestId;
        sigKey = key;
        break;
      }
    }

    // Send exec.approval.resolve RPC for the latest UUID
    const resolveId = crypto.randomUUID();
    pendingRequestIdsRef.current.add(resolveId);
    sendRef.current({
      type: 'req',
      id: resolveId,
      method: 'exec.approval.resolve',
      params: { id: resolveTargetId, decision },
    });

    // Deny ALL other stale UUIDs in the same signature group
    if (sigKey) {
      const entry = pendingCommandSignatures.get(sigKey);
      if (entry) {
        for (const staleId of entry.allIds) {
          if (staleId !== resolveTargetId) {
            const denyRpcId = crypto.randomUUID();
            pendingRequestIdsRef.current.add(denyRpcId);
            sendRef.current({
              type: 'req',
              id: denyRpcId,
              method: 'exec.approval.resolve',
              params: { id: staleId, decision: 'deny' },
            });
          }
        }
        // Remove signature entry
        pendingCommandSignatures.delete(sigKey);
      }
    }

    // Clear the timeout timer
    const timer = approvalTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      approvalTimersRef.current.delete(id);
    }

    // Update reactive state so card shows "Resolving..."
    setPendingApprovals(prev => {
      const next = new Map(prev);
      next.set(id, { ...existing });
      return next;
    });

    // Tier 3A: The 15-second safety-net timer has been REMOVED.
    // It caused users to double-click Allow when execution took >15s,
    // creating unknown requestId errors.  The gateway has its own 120s
    // timeout — trust it.

    console.info(`[Zuberi] User decision for ${id}: ${decision} (resolveTarget: ${resolveTargetId})`);
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
    // ALWAYS scroll to bottom on user send (smooth)
    requestAnimationFrame(() => scrollToBottom('smooth'));

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
      <div
        ref={messageListRef}
        onScroll={handleMessageScroll}
        className="ghost-messages flex-1 overflow-y-auto px-4"
        style={{ background: 'transparent', position: 'relative' }}
      >
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

          {/* Bottom anchor for auto-scroll */}
          <div ref={bottomAnchorRef} aria-hidden="true" />
        </div>

        {/* ── Scroll-to-bottom button ── */}
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={() => scrollToBottom('smooth')}
          style={{
            position: 'sticky',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(var(--surface-2-rgb, 38, 36, 33), 0.85)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            color: 'var(--text-primary)',
            opacity: showScrollBtn ? 1 : 0,
            pointerEvents: showScrollBtn ? 'auto' : 'none',
            transition: 'opacity 200ms ease',
            zIndex: 10,
            marginTop: -44,
          }}
        >
          {/* Chevron-down SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
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
