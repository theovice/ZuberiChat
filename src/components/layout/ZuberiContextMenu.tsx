import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { exit } from '@tauri-apps/plugin-process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MenuAction = {
  type: 'item';
  label: string;
  shortcut?: string;
  action: () => void;
};

type MenuSeparator = {
  type: 'separator';
};

type SubMenuItem = MenuAction | MenuSeparator;

type TopLevelItem = {
  label: string;
  action?: () => void;
  submenu?: SubMenuItem[];
};

type Props = {
  onNewConversation: () => void;
  children: ReactNode;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ZuberiContextMenu({ onNewConversation, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setVisible(false);
    setHoveredIdx(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPos({ x: e.clientX, y: e.clientY });
    setVisible(true);
    setHoveredIdx(null);
  }, []);

  // Close on click outside, scroll, or Escape
  useEffect(() => {
    if (!visible) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [visible, close]);

  // ── Menu definition ─────────────────────────────────────────────────
  const items: TopLevelItem[] = [
    {
      label: 'File',
      submenu: [
        {
          type: 'item',
          label: 'New Conversation',
          shortcut: 'Ctrl+N',
          action: () => {
            onNewConversation();
            close();
          },
        },
        {
          type: 'item',
          label: 'Settings',
          shortcut: 'Ctrl+,',
          action: () => {
            console.info('[Zuberi] Settings not yet implemented');
            close();
          },
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Close',
          shortcut: 'Ctrl+W',
          action: () => {
            getCurrentWindow().close();
          },
        },
        {
          type: 'item',
          label: 'Exit',
          action: () => {
            exit(0);
          },
        },
      ],
    },
    {
      label: 'Kanban',
      action: () => {
        invoke('open_url_in_browser', { url: 'http://localhost:3001' }).catch(
          console.error,
        );
        close();
      },
    },
    {
      label: 'Edit',
      submenu: [
        {
          type: 'item',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          action: () => {
            document.execCommand('undo');
            close();
          },
        },
        {
          type: 'item',
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          action: () => {
            document.execCommand('redo');
            close();
          },
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Cut',
          shortcut: 'Ctrl+X',
          action: () => {
            document.execCommand('cut');
            close();
          },
        },
        {
          type: 'item',
          label: 'Copy',
          shortcut: 'Ctrl+C',
          action: () => {
            document.execCommand('copy');
            close();
          },
        },
        {
          type: 'item',
          label: 'Paste',
          shortcut: 'Ctrl+V',
          action: () => {
            navigator.clipboard
              .readText()
              .then((text) => document.execCommand('insertText', false, text))
              .catch(() => document.execCommand('paste'));
            close();
          },
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: () => {
            document.execCommand('selectAll');
            close();
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          type: 'item',
          label: 'Toggle DevTools',
          shortcut: 'Ctrl+Shift+I',
          action: () => {
            invoke('toggle_devtools').catch(console.error);
            close();
          },
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Zoom In',
          shortcut: 'Ctrl+=',
          action: () => {
            const c = parseFloat(document.body.style.zoom || '1');
            document.body.style.zoom = String(Math.min(c + 0.1, 2.0));
            close();
          },
        },
        {
          type: 'item',
          label: 'Zoom Out',
          shortcut: 'Ctrl+-',
          action: () => {
            const c = parseFloat(document.body.style.zoom || '1');
            document.body.style.zoom = String(Math.max(c - 0.1, 0.5));
            close();
          },
        },
        {
          type: 'item',
          label: 'Reset Zoom',
          shortcut: 'Ctrl+0',
          action: () => {
            document.body.style.zoom = '1';
            close();
          },
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
            close();
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
          action: () => {
            invoke('open_url_in_browser', {
              url: 'https://docs.openclaw.ai',
            }).catch(console.error);
            close();
          },
        },
        {
          type: 'item',
          label: 'About Zuberi',
          action: () => {
            window.alert('Zuberi v0.1.1\nWahwearro Holdings LLC');
            close();
          },
        },
      ],
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────
  if (!visible) {
    return <div onContextMenu={handleContextMenu}>{children}</div>;
  }

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>
      {createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.y,
            left: pos.x,
            zIndex: 9999,
          }}
        >
          <div className="ctx-menu">
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
                {item.submenu && (
                  <span className="ctx-menu-arrow">&#9656;</span>
                )}

                {/* Submenu */}
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
                            <span className="ctx-menu-shortcut">
                              {sub.shortcut}
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
