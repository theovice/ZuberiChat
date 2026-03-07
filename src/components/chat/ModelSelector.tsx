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
};

export function ModelSelector({ send, isConnected, sessionKey, models, onClearGpu, onOpen, onModelLoaded }: ModelSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });
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
      setSelectedModel(models[0].id);
      localStorage.setItem(STORAGE_KEY, models[0].id);
    }
  }, [models]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => {
      if (!prev) {
        onOpen?.(); // trigger model list refresh
        if (btnRef.current) {
          const rect = btnRef.current.getBoundingClientRect();
          // Position: right-aligned, opens upward
          setMenuPos({ top: rect.top, left: rect.right });
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
          borderColor: isLoading ? '#f0a020' : 'var(--border-medium)',
          color: 'var(--text-secondary)',
          cursor: isLoading ? 'default' : 'pointer',
        }}
      >
        <span className="flex-1 truncate text-left">{displayName}</span>
        <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
        {isLoading && (
          <span
            className="text-[10px]"
            style={{ color: '#f0a020', flexShrink: 0 }}
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
            top: menuPos.top,
            left: menuPos.left,
            transform: 'translateY(-100%) translateX(-100%) translateY(-6px)',
            zIndex: 10001,
          }}
        >
          {models.length === 0 && (
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
