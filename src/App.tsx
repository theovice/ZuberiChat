import { Titlebar } from "./components/layout/Titlebar";
import { ClawdChatInterface } from "./components/chat/ClawdChatInterface";
import { useUpdater } from "./hooks/useUpdater";

export default function App() {
  const { updateAvailable, triggerUpdate } = useUpdater();

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
        updateAvailable={updateAvailable}
        onUpdateClick={triggerUpdate}
      />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ClawdChatInterface />
      </div>
    </div>
  );
}
