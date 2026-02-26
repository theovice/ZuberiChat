import { useCallback, useState } from "react";
import { Titlebar } from "./components/layout/Titlebar";
import { PanelLayout } from "./components/layout/PanelLayout";
import { useUpdater } from "./hooks/useUpdater";

export default function App() {
  const { updateAvailable, triggerUpdate } = useUpdater();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handleTogglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-base)",
      }}
    >
      <Titlebar
        isPanelOpen={isPanelOpen}
        onTogglePanel={handleTogglePanel}
        updateAvailable={updateAvailable}
        onUpdateClick={triggerUpdate}
      />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <PanelLayout isPanelOpen={isPanelOpen} />
      </div>
    </div>
  );
}
