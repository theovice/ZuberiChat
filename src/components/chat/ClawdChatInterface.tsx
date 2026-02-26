import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/chat/ConnectionStatus';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const SESSION_KEY = 'agent:main:main';

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
 * Handles both string content and content-block arrays
 * (e.g. [{ type: "text", text: "..." }, ...]).
 */
function extractTextFromMessage(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const m = message as Record<string, unknown>;

  // String content
  if (typeof m.content === 'string') return m.content;

  // Content-block array (OpenClaw standard format)
  if (Array.isArray(m.content)) {
    const parts = m.content
      .filter(
        (block: unknown): block is { type: string; text: string } =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'text' &&
          typeof (block as Record<string, unknown>).text === 'string',
      )
      .map((block) => block.text);
    return parts.length > 0 ? parts.join('\n') : null;
  }

  // Fallback: top-level .text
  if (typeof m.text === 'string') return m.text;
  return null;
}

export function ClawdChatInterface() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handshakeCompleteRef = useRef(false);
  const gatewayTokenRef = useRef<string | null>(null);
  const sendRef = useRef<(msg: WebSocketMessage) => void>(() => {});
  // Track the active chat run for correlating streaming deltas
  const activeRunIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  // Track pending RPC request IDs so we can match ack responses
  const pendingRequestIdsRef = useRef<Set<string>>(new Set());

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
    },
    onMessage: (message) => {
      // ── Handle connect handshake ──────────────────────────────────
      if (message.type === 'res' && !handshakeCompleteRef.current) {
        if (message.ok) {
          handshakeCompleteRef.current = true;
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

      // ── Handle RPC responses (chat.send ack, etc.) ───────────────
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
    },
  });

  // Keep sendRef in sync for challenge-response fallback
  sendRef.current = send;

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
    send({
      type: 'req',
      id: requestId,
      method: 'chat.send',
      params: {
        sessionKey: SESSION_KEY,
        message,
        idempotencyKey: runId,
        deliver: false,
      },
    });

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
      <div style={{ paddingTop: 8, flexShrink: 0, overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

          <div className="mt-3 flex items-center justify-end gap-3">
            <Button type="submit" disabled={!draft.trim()} className="rounded-none bg-[#e6dbcb] text-[#1f1f1d] hover:bg-[#d5cbbd]">
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
