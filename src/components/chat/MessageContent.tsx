/**
 * MessageContent — renders message content with markdown (assistant) or plain text (user).
 * Handles structured content blocks (toolCall, toolResult) via dedicated components.
 * Text blocks route through react-markdown; protocol blocks route through custom renderers.
 */
import { memo, useState, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { zuberiDark } from '@/lib/syntaxTheme';
import { ToolCallBlock } from '@/components/chat/ToolCallBlock';
import { ToolResultBlock } from '@/components/chat/ToolResultBlock';
import type { ContentBlock } from '@/types/message';
import { Copy, Check } from 'lucide-react';

// ── Copy button for code blocks ───────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="code-block-copy"
      aria-label="Copy code"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

// ── ReactMarkdown custom component overrides ──────────────────────
const markdownComponents: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
  // Fenced code blocks: use react-syntax-highlighter
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');

    if (match) {
      return (
        <div className="code-block-wrapper">
          <div className="code-block-header">
            <span className="code-block-lang">{match[1]}</span>
            <CopyButton text={codeString} />
          </div>
          <SyntaxHighlighter
            style={zuberiDark}
            language={match[1]}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: '14px 16px',
              background: 'var(--surface-1)',
              fontSize: '13px',
              lineHeight: '1.5',
              borderRadius: '0',
            }}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      );
    }

    // Inline code (no language tag, not inside a pre)
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  },

  // Links: open in new tab
  a({ href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },

  // Pre: container for code blocks (SyntaxHighlighter handles its own pre)
  pre({ children }) {
    return <>{children}</>;
  },
};

// ── Markdown renderer for text content ────────────────────────────
const MarkdownRenderer = memo(function MarkdownRenderer({ text }: { text: string }) {
  return (
    <div className="zuberi-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

// ── Block renderer (structured content) ──────────────────────────
function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return <MarkdownRenderer key={index} text={block.text} />;
          case 'toolCall':
            return (
              <ToolCallBlock
                key={block.id ?? index}
                toolName={block.toolName}
                args={block.args}
              />
            );
          case 'toolResult':
            return (
              <ToolResultBlock
                key={block.id ?? index}
                toolName={block.toolName}
                text={block.text}
              />
            );
          default:
            // Unknown block type — render as plain text fallback
            return (
              <div key={index} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(block)}
              </div>
            );
        }
      })}
    </>
  );
}

// ── Main export ──────────────────────────────────────────────────
type MessageContentProps = {
  content: string;
  blocks?: ContentBlock[];
  role: 'user' | 'assistant';
};

export const MessageContent = memo(function MessageContent({
  content,
  blocks,
  role,
}: MessageContentProps) {
  // Structured blocks take priority when available
  if (blocks && blocks.length > 0) {
    return <BlockRenderer blocks={blocks} />;
  }

  // User messages: plain text, no markdown parsing
  if (role === 'user') {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</span>;
  }

  // Assistant messages: render through markdown
  return <MarkdownRenderer text={content} />;
});
