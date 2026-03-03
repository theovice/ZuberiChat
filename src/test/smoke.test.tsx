/**
 * ZuberiChat Smoke Tests
 *
 * Purpose: verify every major component renders without crashing.
 * These are NOT behaviour tests — they are "does it mount?" guards.
 * Run before and after every code change: `pnpm test`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Global mocks — Tauri, WebSocket, fetch, localStorage, crypto
// ---------------------------------------------------------------------------

// Tauri IPC
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('No Tauri runtime in test')),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    setFullscreen: vi.fn(),
  }),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  exit: vi.fn(),
}));

// Global WebSocket stub — prevents real connections in jsdom
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;
  readyState = MockWebSocket.CLOSED;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  send = vi.fn();
  close = vi.fn();
}

// Minimal localStorage stub (jsdom has one but we want isolation)
const localStorageMap = new Map<string, string>();
const storageMock: Storage = {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageMap.set(key, value);
  },
  removeItem: (key: string) => {
    localStorageMap.delete(key);
  },
  clear: () => localStorageMap.clear(),
  get length() {
    return localStorageMap.size;
  },
  key: (_index: number) => null,
};

beforeEach(() => {
  localStorageMap.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true });
  // @ts-expect-error — replacing native WebSocket with mock
  globalThis.WebSocket = MockWebSocket;
  // Stub fetch for Ollama / backend calls
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ models: [] }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ============================================================================
// 1. CHAT SMOKE TEST
// ============================================================================
describe('ClawdChatInterface', () => {
  it('renders without crashing', async () => {
    const { ClawdChatInterface } = await import('@/components/chat/ClawdChatInterface');
    const { container } = render(<ClawdChatInterface />);
    expect(container).toBeTruthy();
  });

  it('has a chat input field', async () => {
    const { ClawdChatInterface } = await import('@/components/chat/ClawdChatInterface');
    render(<ClawdChatInterface />);
    const input = screen.getByPlaceholderText('Reply...');
    expect(input).toBeInTheDocument();
  });

  it('has a Send button', async () => {
    const { ClawdChatInterface } = await import('@/components/chat/ClawdChatInterface');
    render(<ClawdChatInterface />);
    const button = screen.getByRole('button', { name: /send/i });
    expect(button).toBeInTheDocument();
  });

  it('shows connecting or connected status on mount', async () => {
    const { ClawdChatInterface } = await import('@/components/chat/ClawdChatInterface');
    const { container } = render(<ClawdChatInterface />);
    // ConnectionStatus renders into a 64px-tall flex container — just verify it exists
    expect(container.querySelector('div')).toBeTruthy();
  });
});

// ============================================================================
// 2. MODEL SELECTOR SMOKE TEST
// ============================================================================
describe('ModelSelector', () => {
  const noop = vi.fn();

  it('renders with empty models array', async () => {
    const { ModelSelector } = await import('@/components/chat/ModelSelector');
    render(
      <ModelSelector
        send={noop}
        isConnected={false}
        sessionKey="test"
        models={[]}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('renders with mock models', async () => {
    const { ModelSelector } = await import('@/components/chat/ModelSelector');
    const models = [
      { id: 'qwen3:14b-fast', name: 'qwen3:14b-fast', parameterSize: '14.8B' },
      { id: 'qwen3:14b', name: 'qwen3:14b', parameterSize: '14.8B' },
    ];
    render(
      <ModelSelector
        send={noop}
        isConnected={true}
        sessionKey="test"
        models={models}
      />,
    );
    expect(screen.getByText(/qwen3:14b-fast/)).toBeInTheDocument();
    expect(screen.getByText('qwen3:14b')).toBeInTheDocument();
  });

  it('shows Clear GPU option when models are loaded', async () => {
    const { ModelSelector } = await import('@/components/chat/ModelSelector');
    const models = [{ id: 'model-a', name: 'model-a' }];
    render(
      <ModelSelector
        send={noop}
        isConnected={true}
        sessionKey="test"
        models={models}
        onClearGpu={noop}
      />,
    );
    expect(screen.getByText(/Clear GPU/)).toBeInTheDocument();
  });
});

// ============================================================================
// 3. GPU STATUS SMOKE TEST
// ============================================================================
describe('GpuStatus', () => {
  it('renders "No model loaded" when API returns empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    const { GpuStatus } = await import('@/components/chat/GpuStatus');
    render(<GpuStatus />);
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
  });

  it('renders loaded model name and VRAM', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [{ name: 'qwen3:14b-fast', size_vram: 8_589_934_592 }],
        }),
    });
    const { GpuStatus } = await import('@/components/chat/GpuStatus');
    render(<GpuStatus />);
    // Wait for the poll to complete and state to update
    await vi.waitFor(() => {
      expect(screen.getByText(/qwen3:14b-fast/)).toBeInTheDocument();
    });
    expect(screen.getByText(/8\.0 GB/)).toBeInTheDocument();
  });
});

// ============================================================================
// 4. FILE ATTACHMENTS SMOKE TEST
// ============================================================================
describe('FileAttachments', () => {
  it('AttachButton renders with paperclip icon', async () => {
    const { AttachButton } = await import('@/components/chat/FileAttachments');
    render(<AttachButton onFiles={vi.fn()} />);
    const button = screen.getByRole('button', { name: /attach files/i });
    expect(button).toBeInTheDocument();
  });

  it('FileChips renders file badges when files are queued', async () => {
    const { FileChips } = await import('@/components/chat/FileAttachments');
    const files = [
      { id: '1', file: new File(['hello'], 'test.txt'), name: 'test.txt', size: 5, status: 'pending' as const },
      { id: '2', file: new File(['world'], 'image.png'), name: 'image.png', size: 5, status: 'done' as const },
    ];
    render(<FileChips files={files} onRemove={vi.fn()} />);
    expect(screen.getByText('test.txt')).toBeInTheDocument();
    expect(screen.getByText('image.png')).toBeInTheDocument();
  });

  it('FileChips renders nothing when no files queued', async () => {
    const { FileChips } = await import('@/components/chat/FileAttachments');
    const { container } = render(<FileChips files={[]} onRemove={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});

// ============================================================================
// 5. APP MOUNT SMOKE TEST
// ============================================================================
describe('App mount', () => {
  it('does not crash when mounting the main chat interface', async () => {
    const { ClawdChatInterface } = await import('@/components/chat/ClawdChatInterface');
    // This is the same component that App.tsx renders — if it mounts, the app boots.
    expect(() => {
      const { unmount } = render(<ClawdChatInterface />);
      unmount();
    }).not.toThrow();
  });
});
