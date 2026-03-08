// platform.ts — Tauri runtime detection and browser preview mocks.
// In a plain browser (pnpm dev at localhost:3000), installs Tauri's
// official mock layer so every invoke/listen/emit/getCurrentWindow call
// succeeds with realistic stub data. In Tauri (dev or production),
// this module is a no-op.

import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

/** Returns true when running inside the Tauri webview. */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as Record<string, unknown>).__TAURI_INTERNALS__ === "object" &&
    (window as Record<string, unknown>).__TAURI_INTERNALS__ !== null
  );
}

/**
 * Install Tauri IPC mocks so the app renders in a plain browser.
 * Must be called BEFORE any component mounts (before createRoot).
 *
 * Uses @tauri-apps/api/mocks which patches window.__TAURI_INTERNALS__
 * with a custom invoke handler. All Tauri API calls route through it.
 */
export function installBrowserMocks(): void {
  // mockWindows must be called BEFORE mockIPC — it sets up
  // window.__TAURI_INTERNALS__.metadata for getCurrentWindow().
  mockWindows("main");

  mockIPC(
    (cmd: string, args?: Record<string, unknown>) => {
      // eslint-disable-next-line no-console
      console.info("[BrowserMock]", cmd, args);

      switch (cmd) {
        // ── Version polling (useVersionPoller.ts) ──
        case "get_installed_version":
          return {
            version: "0.1.1",
            commit: "preview",
            builtAt: new Date().toISOString(),
          };
        case "read_repo_version":
          return {
            version: "0.1.1",
            commit: "preview",
            builtAt: new Date().toISOString(),
          };

        // ── Ollama management (ollama.ts) ──
        case "ensure_ollama":
          return true;
        case "launch_ollama":
          return undefined;
        case "check_ollama_live":
          return true;
        case "ensure_environment":
          return {
            ollama: "running",
            model: "model_present",
            openclaw: "openclaw_ok",
          };

        // ── Gateway token (ClawdChatInterface.tsx) ──
        case "read_gateway_token":
          return "mock-browser-preview-token";

        // ── File uploads (ClawdChatInterface.tsx) ──
        case "save_upload":
          return `uploads/${(args as Record<string, unknown>)?.filename ?? "file.txt"}`;
        case "sync_to_ceg":
          return "ok";

        // ── URL opener (Sidebar.tsx, ZuberiContextMenu.tsx) ──
        case "open_url_in_browser": {
          const url = (args as Record<string, unknown>)?.url;
          if (typeof url === "string") window.open(url, "_blank");
          return undefined;
        }

        // ── DevTools toggle ──
        case "toggle_devtools":
          return undefined;

        // ── Update trigger ──
        case "run_local_update":
          return undefined;

        // ── Process exit (ZuberiContextMenu.tsx, ModeSelector.tsx) ──
        case "plugin:process|exit":
          return undefined;

        // ── Window operations (routed through invoke by Tauri internals) ──
        case "plugin:window|close":
        case "plugin:window|minimize":
        case "plugin:window|maximize":
        case "plugin:window|unmaximize":
        case "plugin:window|set_fullscreen":
          return undefined;
        case "plugin:window|is_maximized":
          return false;
        case "plugin:window|is_fullscreen":
          return false;

        default:
          // eslint-disable-next-line no-console
          console.warn("[BrowserMock] unhandled:", cmd, args);
          return undefined;
      }
    },
    { shouldMockEvents: true }
  );
}
