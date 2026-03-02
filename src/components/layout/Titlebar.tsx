import { PanelRight } from "lucide-react";

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
  return (
    <div className="titlebar">
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
      </div>
    </div>
  );
}
