import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  SquarePen,
  Settings,
  LayoutGrid,
} from 'lucide-react';

interface SidebarProps {
  open: boolean;
}

export function Sidebar({ open }: SidebarProps) {
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

        {/* Bottom links */}
        <button
          className="sidebar-item"
          onClick={() => {
            invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' }).catch(console.error);
          }}
        >
          <LayoutGrid size={16} />
          <span>Kanban Board</span>
        </button>
      </div>
    </div>
  );
}
