import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  SquarePen,
  Search,
  Settings,
  LayoutGrid,
  BookOpen,
  Info,
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

        {/* Navigation */}
        <button className="sidebar-item sidebar-item--disabled" disabled>
          <Search size={16} />
          <span>Search</span>
        </button>
        <button
          className="sidebar-item"
          onClick={() => console.info('[Zuberi] Settings not yet implemented')}
        >
          <Settings size={16} />
          <span>Settings</span>
        </button>

        <div className="sidebar-separator" />

        {/* Recents section */}
        <div className="sidebar-section">Recents</div>
        <div className="sidebar-empty">No conversations yet</div>

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
        <button
          className="sidebar-item"
          onClick={() => {
            invoke('open_url_in_browser', { url: 'https://docs.openclaw.ai' }).catch(console.error);
          }}
        >
          <BookOpen size={16} />
          <span>Documentation</span>
        </button>
        <button
          className="sidebar-item"
          onClick={() => window.alert('Zuberi v0.1.0\nControl interface for OpenClaw')}
        >
          <Info size={16} />
          <span>About Zuberi</span>
        </button>
      </div>
    </div>
  );
}
