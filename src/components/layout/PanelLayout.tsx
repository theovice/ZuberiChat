import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ClawdChatInterface } from "../chat/ClawdChatInterface";

// Lazy-load the heavy Kanban panel so it doesn't bloat the initial bundle
const KanbanPanel = lazy(() =>
  import("./KanbanPanel").then((m) => ({ default: m.KanbanPanel })),
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STORAGE_KEY = "zuberi:kanban-panel-width";
const DEFAULT_PANEL_PCT = 75; // Kanban takes 75% by default
const MIN_CHAT_PCT = 15; // Chat never shrinks below 15%
const MAX_PANEL_PCT = 80; // Kanban never grows beyond 80% (= 100 - 20 chat headroom)
const MIN_PANEL_PCT = 20; // Kanban never shrinks below 20%

function loadPersistedWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= MIN_PANEL_PCT && n <= MAX_PANEL_PCT) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PANEL_PCT;
}

// ---------------------------------------------------------------------------
// PanelLayout
// ---------------------------------------------------------------------------
interface PanelLayoutProps {
  isPanelOpen: boolean;
}

export function PanelLayout({ isPanelOpen }: PanelLayoutProps) {
  const [panelWidth, setPanelWidth] = useState(loadPersistedWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist width changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth]);

  // ------ Divider drag logic (Pointer Events API) ------
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width;
      if (totalWidth === 0) return;

      // Mouse position as % from right edge → that's the kanban width
      const mouseFromRight = rect.right - e.clientX;
      let pct = (mouseFromRight / totalWidth) * 100;

      // Clamp: chat min 15%, kanban min 20%
      pct = Math.max(MIN_PANEL_PCT, Math.min(100 - MIN_CHAT_PCT, pct));

      setPanelWidth(pct);
    },
    [isDragging],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
    },
    [],
  );

  // Derive widths
  const chatWidthPct = isPanelOpen ? 100 - panelWidth : 100;
  const kanbanWidthPct = isPanelOpen ? panelWidth : 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Chat Panel (left) ── */}
      <div
        style={{
          width: `${chatWidthPct}%`,
          height: "100%",
          overflow: "hidden",
          transition: isDragging ? "none" : "width 300ms ease",
          flexShrink: 0,
        }}
      >
        <ClawdChatInterface />
      </div>

      {/* ── Divider ── */}
      {isPanelOpen && (
        <div
          className={`panel-divider${isDragging ? " dragging" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: "none" }}
        />
      )}

      {/* ── Kanban Panel (right) ── */}
      <div
        style={{
          width: `${kanbanWidthPct}%`,
          height: "100%",
          overflow: "hidden",
          transition: isDragging ? "none" : "width 300ms ease",
          flexShrink: 0,
        }}
      >
        {isPanelOpen && (
          <Suspense
            fallback={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-secondary)",
                }}
              >
                Loading Kanban…
              </div>
            }
          >
            <KanbanPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}
