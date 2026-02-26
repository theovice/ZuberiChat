import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Maximize2, PanelRight } from "lucide-react";

const appWindow = getCurrentWindow();

interface TitlebarProps {
  isPanelOpen?: boolean;
  onTogglePanel?: () => void;
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
}

export function Titlebar({
  isPanelOpen = false,
  onTogglePanel,
  updateAvailable = false,
  onUpdateClick,
}: TitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    appWindow.isMaximized().then(setIsMaximized);

    // Listen for resize events to track maximized state
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  return (
    <div
      data-tauri-drag-region
      className="titlebar"
      onMouseDown={(e) => {
        // Only drag on the titlebar background, not on buttons
        if ((e.target as HTMLElement).closest(".titlebar-button")) return;
      }}
    >
      <div className="titlebar-controls">
        {/* Update indicator */}
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

        {/* Kanban panel toggle */}
        <button
          className={`titlebar-button titlebar-button--kanban${isPanelOpen ? " active" : ""}`}
          onClick={onTogglePanel}
          aria-label={isPanelOpen ? "Close Kanban panel" : "Open Kanban panel"}
          title="Toggle Kanban"
        >
          <PanelRight size={15} />
        </button>

        <button
          className="titlebar-button titlebar-button--minimize"
          onClick={handleMinimize}
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>

        <button
          className="titlebar-button titlebar-button--maximize"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Maximize2 size={14} /> : <Square size={14} />}
        </button>

        <button
          className="titlebar-button titlebar-button--close"
          onClick={handleClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
