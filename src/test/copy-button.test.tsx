/**
 * CopyButton component tests (v1.0.1)
 * Verifies: render, clipboard copy, copied state reset
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

import { CopyButton } from '@/components/chat/CopyButton';

// ── Clipboard mock ──────────────────────────────────────────────
let clipboardWriteText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clipboardWriteText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: clipboardWriteText },
    writable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ============================================================================
// CopyButton — rendering
// ============================================================================
describe('CopyButton — rendering', () => {
  it('renders with Copy aria-label', () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    render(<CopyButton text="test content" />);
    const btn = screen.getByLabelText('Copy message');
    expect(btn.tagName).toBe('BUTTON');
  });

  it('has msg-copy-btn class for hover CSS', () => {
    render(<CopyButton text="content" />);
    const btn = screen.getByLabelText('Copy message');
    expect(btn.classList.contains('msg-copy-btn')).toBe(true);
  });
});

// ============================================================================
// CopyButton — clipboard interaction
// ============================================================================
describe('CopyButton — clipboard', () => {
  it('copies text to clipboard on click', async () => {
    render(<CopyButton text="hello world" />);
    const btn = screen.getByLabelText('Copy message');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(clipboardWriteText).toHaveBeenCalledWith('hello world');
  });

  it('copies raw markdown source, not rendered HTML', async () => {
    const markdown = '## Heading\n\n**bold** text with `code`';
    render(<CopyButton text={markdown} />);
    const btn = screen.getByLabelText('Copy message');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(clipboardWriteText).toHaveBeenCalledWith(markdown);
  });

  it('shows Copied aria-label after click', async () => {
    render(<CopyButton text="test" />);
    const btn = screen.getByLabelText('Copy message');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByLabelText('Copied')).toBeInTheDocument();
  });

  it('resets copied state after 1.5 seconds', async () => {
    render(<CopyButton text="test" />);
    const btn = screen.getByLabelText('Copy message');
    await act(async () => {
      fireEvent.click(btn);
    });
    // Immediately after click: "Copied"
    expect(screen.getByLabelText('Copied')).toBeInTheDocument();

    // Advance past the 1.5s timeout
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    // Should be back to "Copy message"
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('renders on user message text', () => {
    // Simulates the pattern used in ClawdChatInterface
    const userText = 'What is the weather today?';
    render(<CopyButton text={userText} />);
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });

  it('renders on assistant message text', () => {
    const assistantText = 'The weather is sunny with a high of 75F.';
    render(<CopyButton text={assistantText} />);
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
  });
});
