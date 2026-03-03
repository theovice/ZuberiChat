import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
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

// ── Gear menu items ──────────────────────────────────────────────
type GearMenuItem =
  | { type: 'item'; label: string; shortcut?: string; action: () => void }
  | { type: 'separator' };

export function ModeSelector({ send, sessionKey }: ModeSelectorProps) {
  const [selectedMode, setSelectedMode] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'off';
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedMode(value);
    localStorage.setItem(STORAGE_KEY, value);

    send({
      type: 'req',
      id: crypto.randomUUID(),
      method: 'sessions.patch',
      params: {
        key: sessionKey,
        execAsk: value,
      },
    });
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((prev) => !prev), []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
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

  const gearItems: GearMenuItem[] = [
    {
      type: 'item',
      label: 'New Conversation',
      shortcut: 'Ctrl+N',
      action: () => { emit('new-conversation'); closeMenu(); },
    },
    { type: 'separator' },
    {
      type: 'item',
      label: 'Toggle DevTools',
      shortcut: 'Ctrl+Shift+I',
      action: () => { invoke('toggle_devtools').catch(console.error); closeMenu(); },
    },
    {
      type: 'item',
      label: 'Toggle Fullscreen',
      shortcut: 'F11',
      action: async () => {
        try {
          const win = getCurrentWindow();
          const isFs = await win.isFullscreen();
          await win.setFullscreen(!isFs);
        } catch (err) {
          console.error('[Zuberi] Fullscreen toggle failed:', err);
        }
        closeMenu();
      },
    },
    { type: 'separator' },
    {
      type: 'item',
      label: 'Kanban Board',
      action: () => {
        invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' }).catch(console.error);
        closeMenu();
      },
    },
    {
      type: 'item',
      label: 'About Zuberi',
      action: () => { window.alert('Zuberi v0.1.0\nControl interface for OpenClaw'); closeMenu(); },
    },
  ];

  return (
    <div className="flex items-center gap-1" ref={menuRef} style={{ position: 'relative' }}>
      {/* Gear icon — clickable, opens menu */}
      <button
        type="button"
        onClick={toggleMenu}
        className="flex shrink-0 items-center justify-center transition-colors"
        style={{
          width: 22,
          height: 22,
          background: menuOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#807e7c',
        }}
        aria-label="Settings menu"
      >
        <Settings size={13} />
      </button>

      {/* Gear dropdown menu */}
      {menuOpen && (
        <div
          className="ctx-menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            zIndex: 9999,
          }}
        >
          {gearItems.map((item, idx) =>
            item.type === 'separator' ? (
              <div key={idx} className="ctx-menu-separator" />
            ) : (
              <div
                key={item.label}
                className="ctx-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                }}
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="ctx-menu-shortcut">{item.shortcut}</span>}
              </div>
            ),
          )}
        </div>
      )}

      {/* Mode selector dropdown */}
      <select
        value={selectedMode}
        onChange={handleModeChange}
        className="h-7 w-[130px] border border-[#4a4947] bg-[#2b2a28] px-1.5 text-xs text-[#b0afae] outline-none focus:ring-0"
      >
        {MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
