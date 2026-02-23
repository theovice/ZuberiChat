import { Titlebar } from "./components/layout/Titlebar";
import { ClawdChatInterface } from "./components/chat/ClawdChatInterface";

export default function App() {
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
      <Titlebar />
      <div style={{ marginTop: "36px", flex: 1, overflow: "hidden" }}>
        <ClawdChatInterface />
      </div>
    </div>
  );
}
