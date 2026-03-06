import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Titlebar } from "./components/layout/Titlebar";
import { Sidebar } from "./components/layout/Sidebar";
import { ClawdChatInterface } from "./components/chat/ClawdChatInterface";
import { useUpdater } from "./hooks/useUpdater";

const SIDEBAR_KEY = "zuberi:sidebar-open";

export default function App() {
  const { updateAvailable, triggerUpdate } = useUpdater();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  });

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }, []);

  // Listen for toggle-sidebar event (from Ctrl+, or titlebar button)
  useEffect(() => {
    const unlisten = listen("toggle-sidebar", toggleSidebar);
    return () => { unlisten.then((fn) => fn()); };
  }, [toggleSidebar]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Titlebar
        updateAvailable={updateAvailable}
        onUpdateClick={triggerUpdate}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar open={sidebarOpen} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ClawdChatInterface />
        </div>
      </div>
    </div>
  );
}
