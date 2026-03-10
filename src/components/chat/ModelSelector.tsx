import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WebSocketMessage } from '@/hooks/useWebSocket';

type ModelEntry = {
  id: string;
  name: string;
  parameterSize?: string;
  family?: string;
};

const STORAGE_KEY = 'zuberi:selected-model';

// ── RTL-057: Valid model catalog ────────────────────────────────────
// Ollama model IDs in the current catalog. If localStorage contains a model
// not in this set, it is stale and must be cleared on startup.
const VALID_MODEL_IDS = new Set([
  'gpt-oss:20b',
  'qwen2.5-coder:14b',
  'qwen3-vl:8b',
]);
const DEFAULT_MODEL = 'gpt-oss:20b';

type ModelSelectorProps = {
  send: (msg: WebSocketMessage) => void;
  isConnected: boolean;
  sessionKey: string;
  /** Models list populated from Ollama on KILO. */
  models: ModelEntry[];
  /** Called when user selects "Clear GPU". */
  onClearGpu?: () => void;
  /** Called when dropdown is opened — triggers model list refresh. */
  onOpen?: () => void;
  /** Called after preload request fires — refreshes GPU model indicator. */
  onModelLoaded?: () => void;
  /** True when Ollama is detected as not running. */
  ollamaDown?: boolean;
  /** Called to attempt launching Ollama and retrying. */
  onRetryOllama?: () => void;
};

export function ModelSelector({ send, isConnected, sessionKey, models, onClearGpu, onOpen, onModelLoaded, ollamaDown, onRetryOllama }: ModelSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // RTL-057: Validate stored model against current catalog
    if (stored && VALID_MODEL_IDS.has(stored)) {
      return stored;
    }
    // Stale or missing — clear and use default
    if (stored) {
      console.warn('[RTL-057] Stale model in localStorage:', stored, '→ clearing to', DEFAULT_MODEL);
    }
    localStorage.setItem(STORAGE_KEY, DEFAULT_MODEL);
    return DEFAULT_MODEL;
  });
  const initialSyncDone = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync selection when models list changes
  useEffect(() => {
    if (models.length === 0) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    const matchesStored = stored && models.some((m) => m.id === stored);
    if (matchesStored) {
      setSelectedModel(stored);
    } else {
      // Fall back to first model in the live Ollama list
      setSelectedModel(models[0].id);
      localStorage.setItem(STORAGE_KEY, models[0].id);
    }

    // RTL-057: On first model list arrival, patch backend to sync modelOverride
    if (!initialSyncDone.current && isConnected) {
      initialSyncDone.current = true;
      const modelToSync = matchesStored ? stored : models[0].id;
      console.info('[RTL-057] Syncing backend modelOverride on startup:', modelToSync);
      send({
        type: 'req',
        id: crypto.randomUUID(),
        method: 'sessions.patch',
        params: {
          key: sessionKey,
          model: modelToSync,
        },
      });
    }
  }, [models, isConnected, send, sessionKey]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => {
      if (!prev) {
        onOpen?.(); // trigger model list refresh
        if (btnRef.current) {
          const rect = btnRef.current.getBoundingClientRect();
          // Use bottom anchoring so menu always grows upward
          const distFromBottom = window.innerHeight - rect.top;
          setMenuPos({ bottom: distFromBottom + 6, left: rect.right });
        }
      }
      return !prev;
    });
  }, [onOpen]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) {
        closeMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  const handleSelectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem(STORAGE_KEY, modelId);
    closeMenu();

    send({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.patch',
      params: {
        key: sessionKey,
        model: modelId,
      },
    });

    // Preload the selected model into GPU VRAM via Ollama
    setIsLoading(true);
    fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, prompt: '', stream: false, keep_alive: '5m' }),
    })
      .then(() => {
        console.info('[Zuberi] Model preloaded into GPU:', modelId);
        onModelLoaded?.();
      })
      .catch((err) => {
        console.error('[Zuberi] Model preload failed:', err);
      })
      .finally(() => setIsLoading(false));
  }, [send, sessionKey, closeMenu, onModelLoaded]);

  const handleClearGpu = useCallback(() => {
    closeMenu();
    onClearGpu?.();
  }, [closeMenu, onClearGpu]);

  const listLoading = isConnected && models.length === 0;
  const displayName = selectedModel || (listLoading ? 'Loading...' : 'No models');

  return (
    <div className="relative flex items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        disabled={isLoading}
        className="flex h-7 items-center gap-1 border px-2 text-xs transition-colors disabled:opacity-50"
        style={{
          width: 150,
          background: 'var(--surface-1)',
          borderColor: isLoading ? 'var(--ember)' : 'var(--border-medium)',
          color: 'var(--text-secondary)',
          cursor: isLoading ? 'default' : 'pointer',
        }}
      >
        <span className="flex-1 truncate text-left">{displayName}</span>
        <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
        {isLoading && (
          <span
            className="text-[10px]"
            style={{ color: 'var(--ember)', flexShrink: 0 }}
            title="Loading model into GPU..."
          >
            &#x27F3;
          </span>
        )}
      </button>

      {/* Dropdown — opens upward, right-aligned to button */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{
            position: 'fixed',
            bottom: menuPos.bottom,
            left: menuPos.left,
            transform: 'translateX(-100%)',
            zIndex: 10001,
          }}
        >
          {models.length === 0 && ollamaDown && (
            <div style={{ padding: '8px 12px' }}>
              <div style={{ color: 'var(--status-danger)', fontSize: 11, marginBottom: 6 }}>
                Ollama is not running
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 6 }}>
                Auto-launch failed. If this persists, check: %LOCALAPPDATA%\Ollama\server.log
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    onRetryOllama?.();
                  }}
                  style={{
                    background: 'var(--surface-interactive)',
                    border: '1px solid var(--border-interactive)',
                    color: 'var(--ember)',
                    fontSize: 11,
                    padding: '3px 10px',
                    cursor: 'pointer',
                    borderRadius: 3,
                  }}
                >
                  Start Ollama
                </button>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    onRetryOllama?.();
                  }}
                  style={{ color: 'var(--ember)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Retry
                </span>
              </div>
            </div>
          )}
          {models.length === 0 && !ollamaDown && (
            <div className="ctx-menu-item" style={{ opacity: 0.5, cursor: 'default' }}>
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {listLoading ? 'Loading models...' : 'No models available'}
              </span>
            </div>
          )}
          {models.map((m) => (
            <div
              key={m.id}
              className="ctx-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectModel(m.id);
              }}
            >
              <span>{m.name}</span>
              {m.id === selectedModel && (
                <span style={{ marginLeft: 'auto', paddingLeft: 12, color: 'var(--ember)', fontSize: 11 }}>
                  &#x25CF;
                </span>
              )}
            </div>
          ))}
          {models.length > 0 && (
            <>
              <div className="ctx-menu-separator" />
              <div
                className="ctx-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearGpu();
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>&#x23CF; Clear GPU</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
