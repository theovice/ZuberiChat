import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, PanelLeft, Square, X } from 'lucide-react';
import { UsageMeter } from '../chat/UsageMeter';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface TitlebarProps {
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function Titlebar({ updateAvailable = false, onUpdateClick, sidebarOpen = false, onToggleSidebar }: TitlebarProps) {
  // ── Global keyboard shortcuts ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        emit('new-conversation');
      } else if (ctrl && e.key === ',') {
        e.preventDefault();
        emit('toggle-sidebar');
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

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="titlebar" data-tauri-drag-region>
      {/* Left: sidebar toggle + Zuberi title */}
      <div className="titlebar-menu-anchor" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          className="titlebar-button sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (Ctrl+,)"
          style={{ opacity: sidebarOpen ? 1 : 0.5 }}
        >
          <PanelLeft size={14} />
        </button>
        <span className="titlebar-title">Zuberi</span>
      </div>

      {/* Center spacer — drag region */}
      <div style={{ flex: 1 }} data-tauri-drag-region />

      {/* Right: usage meter + update indicator + window controls */}
      <div className="titlebar-controls">
        <UsageMeter />
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
