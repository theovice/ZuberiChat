import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { exit } from '@tauri-apps/plugin-process';
import { ChevronDown, Minus, Square, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MenuAction = {
  type: 'item';
  label: string;
  shortcut?: string;
  action: () => void;
};

type MenuSeparator = { type: 'separator' };
type SubMenuItem = MenuAction | MenuSeparator;

type TopLevelItem = {
  label: string;
  action?: () => void;
  submenu?: SubMenuItem[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface TitlebarProps {
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
}

export function Titlebar({ updateAvailable = false, onUpdateClick }: TitlebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setHoveredIdx(null);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
    setHoveredIdx(null);
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  // ── Global keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        emit('new-conversation');
      } else if (ctrl && e.key === ',') {
        e.preventDefault();
        emit('open-settings');
      } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        getCurrentWindow().close();
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        invoke('toggle_devtools').catch(console.error);
      } else if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        emit('zoom', 'in');
      } else if (ctrl && e.key === '-') {
        e.preventDefault();
        emit('zoom', 'out');
      } else if (ctrl && e.key === '0') {
        e.preventDefault();
        emit('zoom', 'reset');
      } else if (e.key === 'F11') {
        e.preventDefault();
        getCurrentWindow()
          .isFullscreen()
          .then((fs) => getCurrentWindow().setFullscreen(!fs))
          .catch(console.error);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Window controls ───────────────────────────────────────────
  const handleMinimize = useCallback(() => {
    getCurrentWindow().minimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }, []);

  const handleClose = useCallback(() => {
    getCurrentWindow().close();
  }, []);

  // ── Menu definition ───────────────────────────────────────────
  const items: TopLevelItem[] = [
    {
      label: 'File',
      submenu: [
        {
          type: 'item',
          label: 'New Conversation',
          shortcut: 'Ctrl+N',
          action: () => { emit('new-conversation'); closeMenu(); },
        },
        {
          type: 'item',
          label: 'Settings',
          shortcut: 'Ctrl+,',
          action: () => { console.info('[Zuberi] Settings not yet implemented'); closeMenu(); },
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Close',
          shortcut: 'Ctrl+W',
          action: () => getCurrentWindow().close(),
        },
        {
          type: 'item',
          label: 'Exit',
          action: () => exit(0),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { type: 'item', label: 'Undo', shortcut: 'Ctrl+Z', action: () => { document.execCommand('undo'); closeMenu(); } },
        { type: 'item', label: 'Redo', shortcut: 'Ctrl+Y', action: () => { document.execCommand('redo'); closeMenu(); } },
        { type: 'separator' },
        { type: 'item', label: 'Cut', shortcut: 'Ctrl+X', action: () => { document.execCommand('cut'); closeMenu(); } },
        { type: 'item', label: 'Copy', shortcut: 'Ctrl+C', action: () => { document.execCommand('copy'); closeMenu(); } },
        {
          type: 'item',
          label: 'Paste',
          shortcut: 'Ctrl+V',
          action: () => {
            navigator.clipboard
              .readText()
              .then((text) => document.execCommand('insertText', false, text))
              .catch(() => document.execCommand('paste'));
            closeMenu();
          },
        },
        { type: 'separator' },
        { type: 'item', label: 'Select All', shortcut: 'Ctrl+A', action: () => { document.execCommand('selectAll'); closeMenu(); } },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          type: 'item',
          label: 'Toggle DevTools',
          shortcut: 'Ctrl+Shift+I',
          action: () => { invoke('toggle_devtools').catch(console.error); closeMenu(); },
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Zoom In',
          shortcut: 'Ctrl+=',
          action: () => { emit('zoom', 'in'); closeMenu(); },
        },
        {
          type: 'item',
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          action: () => { emit('zoom', 'out'); closeMenu(); },
        },
        {
          type: 'item',
          label: 'Reset Zoom',
          shortcut: 'Ctrl+0',
          action: () => { emit('zoom', 'reset'); closeMenu(); },
        },
        { type: 'separator' },
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
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          type: 'item',
          label: 'Documentation',
          action: () => { invoke('open_url_in_browser', { url: 'https://docs.openclaw.ai' }).catch(console.error); closeMenu(); },
        },
        {
          type: 'item',
          label: 'About Zuberi',
          action: () => { window.alert('Zuberi v0.1.0\nControl interface for OpenClaw'); closeMenu(); },
        },
      ],
    },
    {
      label: 'Kanban Board',
      action: () => {
        invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' }).catch(console.error);
        closeMenu();
      },
    },
  ];

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="titlebar" data-tauri-drag-region>
      {/* Left: Zuberi title + chevron dropdown */}
      <div ref={menuRef} className="titlebar-menu-anchor">
        <button className="titlebar-menu-trigger" onClick={toggleMenu}>
          <span className="titlebar-title">Zuberi</span>
          <ChevronDown size={12} style={{ marginLeft: 4, opacity: 0.6 }} />
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="titlebar-dropdown ctx-menu">
            {items.map((item, idx) => (
              <div
                key={item.label}
                className="ctx-menu-item"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => {
                  if (!item.submenu) setHoveredIdx(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.action) item.action();
                }}
              >
                <span>{item.label}</span>
                {item.submenu && <span className="ctx-menu-arrow">&#9656;</span>}

                {/* Submenu flyout */}
                {item.submenu && hoveredIdx === idx && (
                  <div className="ctx-submenu ctx-menu">
                    {item.submenu.map((sub, si) =>
                      sub.type === 'separator' ? (
                        <div key={si} className="ctx-menu-separator" />
                      ) : (
                        <div
                          key={sub.label}
                          className="ctx-menu-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            sub.action();
                          }}
                        >
                          <span>{sub.label}</span>
                          {sub.shortcut && (
                            <span className="ctx-menu-shortcut">{sub.shortcut}</span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Center spacer — drag region */}
      <div style={{ flex: 1 }} data-tauri-drag-region />

      {/* Right: update indicator + window controls */}
      <div className="titlebar-controls">
        {updateAvailable && (
          <button
            className="titlebar-button titlebar-button--update"
            onClick={onUpdateClick}
            aria-label="Update available"
            title="Update available — click to install"
          >
            <span className="update-dot" />
          </button>
        )}
        <button className="titlebar-button" onClick={handleMinimize} aria-label="Minimize">
          <Minus size={14} />
        </button>
        <button className="titlebar-button" onClick={handleMaximize} aria-label="Maximize">
          <Square size={10} />
        </button>
        <button className="titlebar-button titlebar-button--close" onClick={handleClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
