interface TitlebarProps {
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
}

export function Titlebar({
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
      </div>
    </div>
  );
}
