import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WebSocketMessage } from '@/hooks/useWebSocket';

type ModeOption = {
  label: string;
  value: string;
};

const MODE_OPTIONS: ModeOption[] = [
  { label: 'Auto accept edits', value: 'off' },
  { label: 'Ask permissions', value: 'on-miss' },
  { label: 'Always ask', value: 'always' },
];

const STORAGE_KEY = 'zuberi:exec-mode';

type ModeSelectorProps = {
  send: (msg: WebSocketMessage) => void;
  sessionKey: string;
};

export function ModeSelector({ send, sessionKey }: ModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'off';
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ bottom: number; left: number }>({ bottom: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => {
      if (!prev && btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        // Use bottom anchoring so menu always grows upward
        const distFromBottom = window.innerHeight - rect.top;
        setMenuPos({ bottom: distFromBottom + 6, left: rect.left });
      }
      return !prev;
    });
  }, []);

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

  const handleSelect = useCallback((value: string) => {
    setSelectedMode(value);
    localStorage.setItem(STORAGE_KEY, value);
    closeMenu();

    send({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.patch',
      params: {
        key: sessionKey,
        execAsk: value,
      },
    });
  }, [send, sessionKey, closeMenu]);

  const selectedLabel = MODE_OPTIONS.find((o) => o.value === selectedMode)?.label ?? 'Auto accept edits';

  return (
    <div className="relative flex items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        className="flex h-7 items-center gap-1 border px-1.5 text-xs outline-none"
        style={{ width: 150, cursor: 'pointer', background: 'var(--surface-2)', borderColor: 'var(--border-interactive)', color: 'var(--text-secondary)' }}
      >
        <span className="flex-1 truncate text-left">{selectedLabel}</span>
        <ChevronDown size={10} style={{ opacity: 0.5, flexShrink: 0 }} />
      </button>

      {/* Dropdown — always opens upward via fixed positioning */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{
            position: 'fixed',
            bottom: menuPos.bottom,
            left: menuPos.left,
            zIndex: 10001,
          }}
        >
          {MODE_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className="ctx-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(opt.value);
              }}
            >
              <span>{opt.label}</span>
              {opt.value === selectedMode && (
                <span style={{ marginLeft: 'auto', paddingLeft: 12, color: 'var(--ember)', fontSize: 11 }}>
                  &#x25CF;
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
