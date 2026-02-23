import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const ACTIONS = ['</> Code', 'Strategize', 'Create', 'Write', 'Learn'] as const;

function extractAssistantChunk(message: WebSocketMessage): string | null {
  const chunk =
    message.delta ??
    message.content ??
    message.text ??
    (typeof message.data === 'object' && message.data !== null
      ? (message.data as Record<string, unknown>).delta ??
        (message.data as Record<string, unknown>).content ??
        (message.data as Record<string, unknown>).text
      : null);

  return typeof chunk === 'string' ? chunk : null;
}

export function ClawdChatInterface() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  const { send, isConnected, connectionState } = useWebSocket({
    autoConnect: true,
    url: 'ws://localhost:18789',
    onMessage: (message) => {
      const nextChunk = extractAssistantChunk(message);
      if (!nextChunk) return;

      setMessages((current) => {
        if (!streamingMessageIdRef.current) {
          const id = crypto.randomUUID();
          streamingMessageIdRef.current = id;
          return [...current, { id, role: 'assistant', content: nextChunk }];
        }

        return current.map((entry) =>
          entry.id === streamingMessageIdRef.current
            ? { ...entry, content: `${entry.content}${nextChunk}` }
            : entry
        );
      });
    },
  });

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;

    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [draft]);

  const connectionLabel = useMemo(() => {
    if (isConnected) return 'Connected to OpenClaw';
    if (connectionState === 'reconnecting') return 'Reconnecting to OpenClaw…';
    if (connectionState === 'connecting') return 'Connecting to OpenClaw…';
    return 'Disconnected from OpenClaw';
  }, [connectionState, isConnected]);

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
    streamingMessageIdRef.current = null;

    send({
      type: 'openclaw:chat:message',
      message,
      source: 'clawd-chat-interface',
      timestamp: new Date().toISOString(),
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
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-center gap-3 text-[#e6dbcb]">
        <Sparkles className="h-7 w-7" aria-hidden="true" />
        <h1 style={{ fontFamily: 'Recoleta, "Times New Roman", serif' }} className="text-5xl">
          Good evening, James
        </h1>
      </div>

      <div className="mb-4 text-center text-xs text-muted-foreground">{connectionLabel}</div>

      <ScrollArea className="mb-5 flex-1 rounded-xl border border-[#4a4947] bg-[#252422]/40 p-4">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your conversation with OpenClaw will appear here.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-lg border border-[#4a4947] bg-[#31302e] px-3 py-2 text-sm text-[#e6dbcb]'
                    : 'max-w-[85%] rounded-lg border border-[#4a4947] bg-[#2b2a28] px-3 py-2 text-sm text-[#d3c8b7]'
                }
              >
                {message.content}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="rounded-xl border border-[#4a4947] bg-[#31302e] p-3">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            className="max-h-[220px] min-h-[96px] resize-none border-none bg-transparent px-0 text-sm text-[#e6dbcb] placeholder:text-[#b0afae] focus-visible:ring-0"
            style={{ userSelect: 'text' }}
          />

          <div className="mt-3 flex items-center justify-end gap-3">
            <Button type="submit" disabled={!draft.trim()} className="bg-[#e6dbcb] text-[#1f1f1d] hover:bg-[#d5cbbd]">
              Send
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ACTIONS.map((action) => (
            <Button
              key={action}
              type="button"
              variant="ghost"
              className="h-8 border border-[#4a4947] px-3 text-[#b0afae] hover:bg-[#31302e] hover:text-[#e6dbcb]"
            >
              {action}
            </Button>
          ))}
        </div>
      </form>
    </div>
  );
}
