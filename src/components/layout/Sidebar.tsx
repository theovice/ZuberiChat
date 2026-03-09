import { useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  SquarePen,
  Settings,
  LayoutGrid,
} from 'lucide-react';

interface SidebarProps {
  open: boolean;
  updateAvailable?: boolean;
  availableVersion?: string | null;
}

export function Sidebar({ open, updateAvailable = false, availableVersion = null }: SidebarProps) {
  const [updating, setUpdating] = useState(false);

  const handleUpdate = () => {
    if (updating) return;
    const confirmed = window.confirm(
      `Update Zuberi to v${availableVersion}? This will build and reinstall the app.`
    );
    if (!confirmed) return;
    setUpdating(true);
    invoke('run_local_update').catch((err) => {
      console.error('[Zuberi] run_local_update failed:', err);
      setUpdating(false);
    });
  };

  return (
    <div
      className="sidebar"
      style={{ width: open ? 260 : 0 }}
    >
      <div className="sidebar-inner">
        {/* New chat button */}
        <button
          className="sidebar-item sidebar-item--primary"
          onClick={() => emit('new-conversation')}
        >
          <SquarePen size={16} />
          <span>New chat</span>
        </button>

        <div className="sidebar-separator" />

        {/* Settings */}
        <button
          className="sidebar-item"
          onClick={() => emit('open-settings')}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        <div className="sidebar-separator" />

        {/* KANBAN REMOVED — RTL-049. Moved to bottom bar in ClawdChatInterface.
        <button
          className="sidebar-item"
          onClick={() => {
            invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' }).catch(console.error);
          }}
        >
          <LayoutGrid size={16} />
          <span>Kanban Board</span>
        </button>
        */}

        {updateAvailable && availableVersion && (
          <button
            onClick={handleUpdate}
            disabled={updating}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              color: updating ? 'var(--text-muted)' : 'var(--ember)',
              marginTop: 4,
              background: 'none',
              border: 'none',
              cursor: updating ? 'default' : 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            {updating ? 'Updating...' : `Update available: v${availableVersion}`}
          </button>
        )}
      </div>
    </div>
  );
}
