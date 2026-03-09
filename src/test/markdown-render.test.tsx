/**
 * RTL-048 Markdown + Structured Block rendering tests
 * Verifies: MessageContent, ToolCallBlock, ToolResultBlock, plain text fallback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { MessageContent } from '@/components/chat/MessageContent';
import { ToolCallBlock } from '@/components/chat/ToolCallBlock';
import { ToolResultBlock } from '@/components/chat/ToolResultBlock';
import type { ContentBlock } from '@/types/message';

// ── Minimal localStorage stub ────────────────────────────────────
const localStorageMap = new Map<string, string>();
const storageMock: Storage = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { localStorageMap.set(key, value); },
  removeItem: (key: string) => { localStorageMap.delete(key); },
  clear: () => localStorageMap.clear(),
  get length() { return localStorageMap.size; },
  key: (_i: number) => null,
};

beforeEach(() => {
  localStorageMap.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true });
  // Mock clipboard for copy button
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ============================================================================
// MessageContent — plain text rendering
// ============================================================================
describe('MessageContent — plain text', () => {
  it('renders user messages as plain text (no markdown)', () => {
    render(<MessageContent content="hello **world**" role="user" />);
    // Should render literally, NOT bold
    expect(screen.getByText('hello **world**')).toBeInTheDocument();
  });

  it('renders assistant plain text without artifacts', () => {
    render(<MessageContent content="Hello, how can I help you?" role="assistant" />);
    expect(screen.getByText('Hello, how can I help you?')).toBeInTheDocument();
  });

  it('renders empty content without crashing', () => {
    const { container } = render(<MessageContent content="" role="assistant" />);
    expect(container).toBeTruthy();
  });
});

// ============================================================================
// MessageContent — markdown rendering
// ============================================================================
describe('MessageContent — markdown', () => {
  it('renders bold text', () => {
    render(<MessageContent content="This is **bold** text" role="assistant" />);
    const strong = document.querySelector('strong');
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe('bold');
  });

  it('renders italic text', () => {
    render(<MessageContent content="This is *italic* text" role="assistant" />);
    const em = document.querySelector('em');
    expect(em).toBeTruthy();
    expect(em?.textContent).toBe('italic');
  });

  it('renders inline code', () => {
    render(<MessageContent content="Use `console.log()` here" role="assistant" />);
    const code = document.querySelector('.inline-code');
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe('console.log()');
  });

  it('renders headings', () => {
    render(<MessageContent content={"# Heading 1\n\n## Heading 2\n\n### Heading 3"} role="assistant" />);
    expect(document.querySelector('h1')?.textContent).toBe('Heading 1');
    expect(document.querySelector('h2')?.textContent).toBe('Heading 2');
    expect(document.querySelector('h3')?.textContent).toBe('Heading 3');
  });

  it('renders unordered lists', () => {
    render(<MessageContent content={"Here are items:\n\n- Item 1\n- Item 2\n- Item 3"} role="assistant" />);
    const items = document.querySelectorAll('li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe('Item 1');
  });

  it('renders ordered lists', () => {
    render(<MessageContent content={"Steps:\n\n1. First\n2. Second\n3. Third"} role="assistant" />);
    const ol = document.querySelector('ol');
    expect(ol).toBeTruthy();
    const items = ol?.querySelectorAll('li');
    expect(items?.length).toBe(3);
  });

  it('renders links with target="_blank"', () => {
    render(<MessageContent content="[Link](https://example.com)" role="assistant" />);
    const link = document.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders blockquotes', () => {
    render(<MessageContent content="> This is a quote" role="assistant" />);
    const blockquote = document.querySelector('blockquote');
    expect(blockquote).toBeTruthy();
    expect(blockquote?.textContent).toContain('This is a quote');
  });

  it('renders tables (GFM)', () => {
    const md = '| Header | Col |\n| --- | --- |\n| Cell | Val |';
    render(<MessageContent content={md} role="assistant" />);
    const table = document.querySelector('table');
    expect(table).toBeTruthy();
    const th = document.querySelectorAll('th');
    expect(th.length).toBe(2);
    expect(th[0].textContent).toBe('Header');
  });

  it('renders fenced code blocks with language tag', () => {
    const md = '```python\nprint("hello")\n```';
    render(<MessageContent content={md} role="assistant" />);
    // Should have a code block wrapper with language label
    const langLabel = document.querySelector('.code-block-lang');
    expect(langLabel).toBeTruthy();
    expect(langLabel?.textContent).toBe('python');
  });

  it('renders code blocks with copy button', () => {
    const md = '```js\nconsole.log("test")\n```';
    render(<MessageContent content={md} role="assistant" />);
    const copyBtn = document.querySelector('.code-block-copy');
    expect(copyBtn).toBeTruthy();
  });

  it('renders horizontal rules', () => {
    render(<MessageContent content={"Some text above.\n\n***\n\nSome text below."} role="assistant" />);
    const hr = document.querySelector('hr');
    expect(hr).toBeTruthy();
  });

  it('wraps markdown content in .zuberi-markdown class', () => {
    render(<MessageContent content="test" role="assistant" />);
    const wrapper = document.querySelector('.zuberi-markdown');
    expect(wrapper).toBeTruthy();
  });
});

// ============================================================================
// MessageContent — structured blocks
// ============================================================================
describe('MessageContent — structured blocks', () => {
  it('renders text blocks through markdown', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Hello **world**' },
    ];
    render(<MessageContent content="fallback" blocks={blocks} role="assistant" />);
    const strong = document.querySelector('strong');
    expect(strong?.textContent).toBe('world');
  });

  it('renders toolCall blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Running tool:' },
      { type: 'toolCall', toolName: 'bash', args: { command: 'ls -la' } },
    ];
    render(<MessageContent content="fallback" blocks={blocks} role="assistant" />);
    expect(screen.getByText('bash')).toBeInTheDocument();
  });

  it('renders toolResult blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'toolResult', toolName: 'bash', text: 'file1.txt\nfile2.txt' },
    ];
    render(<MessageContent content="fallback" blocks={blocks} role="assistant" />);
    expect(screen.getByText('bash')).toBeInTheDocument();
  });

  it('renders mixed blocks (text + toolCall + toolResult)', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'Let me check:' },
      { type: 'toolCall', toolName: 'read_file', args: { path: '/tmp/test' } },
      { type: 'toolResult', toolName: 'read_file', text: 'file contents here' },
      { type: 'text', text: 'Done!' },
    ];
    render(<MessageContent content="fallback" blocks={blocks} role="assistant" />);
    expect(screen.getByText('Let me check:')).toBeInTheDocument();
    expect(screen.getAllByText('read_file').length).toBe(2); // call + result
    expect(screen.getByText('Done!')).toBeInTheDocument();
  });

  it('falls back to content string when no blocks', () => {
    render(<MessageContent content="plain fallback" role="assistant" />);
    expect(screen.getByText('plain fallback')).toBeInTheDocument();
  });

  it('falls back to content string when blocks is empty array', () => {
    render(<MessageContent content="fallback text" blocks={[]} role="assistant" />);
    expect(screen.getByText('fallback text')).toBeInTheDocument();
  });
});

// ============================================================================
// ToolCallBlock
// ============================================================================
describe('ToolCallBlock', () => {
  it('renders tool name', () => {
    render(<ToolCallBlock toolName="bash" />);
    expect(screen.getByText('bash')).toBeInTheDocument();
  });

  it('shows chevron when args are present', () => {
    render(<ToolCallBlock toolName="bash" args={{ command: 'ls' }} />);
    // Should have a chevron indicator
    const chevron = document.querySelector('.tool-block-chevron');
    expect(chevron).toBeTruthy();
  });

  it('expands to show args when clicked', () => {
    render(<ToolCallBlock toolName="bash" args={{ command: 'ls -la' }} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    // Should show the args JSON
    expect(screen.getByText(/"command": "ls -la"/)).toBeInTheDocument();
  });

  it('has no chevron when no args', () => {
    render(<ToolCallBlock toolName="bash" />);
    const chevron = document.querySelector('.tool-block-chevron');
    expect(chevron).toBeFalsy();
  });
});

// ============================================================================
// ToolResultBlock
// ============================================================================
describe('ToolResultBlock', () => {
  it('renders tool name', () => {
    render(<ToolResultBlock toolName="read_file" text="content" />);
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });

  it('shows result text directly when short (<= 5 lines)', () => {
    const { container } = render(<ToolResultBlock toolName="bash" text={"line1\nline2\nline3"} />);
    const pre = container.querySelector('.tool-block-detail');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe('line1\nline2\nline3');
  });

  it('collapses long results (>5 lines) by default', () => {
    const longText = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    render(<ToolResultBlock toolName="bash" text={longText} />);
    // Should show truncated view with "..."
    expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
  });

  it('expands long results when clicked', () => {
    const longText = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const { container } = render(<ToolResultBlock toolName="bash" text={longText} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    // Should now show full text in expanded pre
    const pre = container.querySelector('.tool-block-detail:not(.tool-block-detail--truncated)');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toBe(longText);
  });
});
