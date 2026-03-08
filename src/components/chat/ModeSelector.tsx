import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ShieldCheck, Code, FileText, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PermissionMode } from '@/types/permissions';

type ModeOption = {
  label: string;
  value: PermissionMode;
  description: string;
  icon: LucideIcon;
  /** If true, description renders in --status-danger color. */
  cautionary?: boolean;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    label: 'Ask permissions',
    value: 'ask',
    description: 'Ask before tool actions',
    icon: ShieldCheck,
  },
  {
    label: 'Auto accept edits',
    value: 'auto',
    description: 'Auto-approve safe file operations',
    icon: Code,
  },
  {
    label: 'Plan mode',
    value: 'plan',
    description: 'Block all tool execution',
    icon: FileText,
  },
  {
    label: 'Bypass permissions',
    value: 'bypass',
    description: 'Skip all approval checks',
    icon: AlertTriangle,
    cautionary: true,
  },
];

type ModeSelectorProps = {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
};

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
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

  const handleSelect = useCallback((value: PermissionMode) => {
    closeMenu();
    onModeChange(value);
  }, [closeMenu, onModeChange]);

  const selected = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];
  const SelectedIcon = selected.icon;

  return (
    <div className="relative flex items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        className="flex h-7 items-center gap-1.5 border px-2 text-xs outline-none"
        style={{ width: 170, cursor: 'pointer', background: 'var(--surface-2)', borderColor: 'var(--border-interactive)', color: 'var(--text-secondary)' }}
      >
        <SelectedIcon size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
        <span className="flex-1 truncate text-left">{selected.label}</span>
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
            minWidth: 240,
          }}
        >
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <div
                key={opt.value}
                className="ctx-menu-item"
                style={{ padding: '8px 14px', alignItems: 'flex-start' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.value);
                }}
              >
                <Icon size={14} style={{ flexShrink: 0, marginTop: 2, opacity: 0.7 }} />
                <div style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{
                    fontSize: 11,
                    color: opt.cautionary ? 'var(--status-danger)' : 'var(--text-muted)',
                    marginTop: 1,
                  }}>
                    {opt.description}
                  </div>
                </div>
                {opt.value === mode && (
                  <span style={{ marginLeft: 8, paddingTop: 2, color: 'var(--ember)', fontSize: 11, flexShrink: 0 }}>
                    &#x2713;
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
