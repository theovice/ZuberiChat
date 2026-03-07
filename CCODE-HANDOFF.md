# ZuberiChat — ccode Handoff

**Updated:** 2026-03-07
**Repo:** C:\Users\PLUTO\github\Repo\ZuberiChat
**Installed version:** 0.1.2
**Repo version:** 0.1.2
**Smoke tests:** 13/13 (run `pnpm test` to verify)

## Current Sidebar State

Items (in order):
1. **New chat** — icon: SquarePen, event: `emit('new-conversation')`
2. **Settings** — icon: Settings, event: `emit('open-settings')`
3. *(spacer)*
4. **Kanban Board** — icon: LayoutGrid, action: `invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' })`

About Zuberi location: `ZuberiContextMenu.tsx` (right-click menu > Help > About Zuberi), NOT in the sidebar
About Zuberi text: `Zuberi v0.1.1\nWahwearro Holdings LLC`

## Known Architecture Facts

- Tauri v2: `security.csp` lives inside `app` object (`app.security.csp`), NOT at root level
- CSP must include: `connect-src 'self' ipc: http://ipc.localhost http://localhost:11434 ws://127.0.0.1:18789`
- CSP must include: `default-src 'self' tauri: asset: ipc: http://ipc.localhost` for Tauri IPC to work
- Ollama CORS: `OLLAMA_ORIGINS=http://tauri.localhost,http://localhost:3000` at User env level on KILO
- Ollama CORS: do NOT use `tauri://localhost` — gin-contrib/cors panics on non-http schemes. Tauri v2 production origin is `http://tauri.localhost`
- OpenClaw gateway: `controlUi.allowedOrigins` in `C:\Users\PLUTO\openclaw_config\openclaw.json` must include `http://tauri.localhost`
- Tauri IPC CSP: `connect-src` must include `ipc: http://ipc.localhost` or IPC calls fail in production
- Model selector auto-refresh gated on `handshakeComplete` (line 418 of ClawdChatInterface.tsx) — expected, not a bug
- Clicking model selector dropdown bypasses gate via `onOpen` -> `fetchModels()` and fetches from Ollama directly
- Model selector button `disabled` condition is `isLoading` only — do NOT re-add `models.length === 0` (causes chicken-and-egg)
- `fetchModels()` calls `http://localhost:11434/api/tags` — plain GET, no headers
- `sandbox.docker.network` must stay `"none"` — `"host"` crashes compose stack
- Never start ccode sessions by assuming installed app matches repo — always check git log
- Dev mode (`pnpm tauri dev`) has no CSP. Production build enforces Tauri v2 default CSP
- Single-instance guard: `tauri-plugin-single-instance` v2.4.0
- Capabilities file: `src-tauri/capabilities/default.json` — do NOT add `updater:default` or `http:` scopes here
- Cargo.toml version is `0.1.0` (Cargo-level), tauri.conf.json version is `0.1.1` (app-level) — Tauri uses tauri.conf.json

- `find_config()` in main.rs searches: OPENCLAW_CONFIG env var → exe walk-up → cwd → USERPROFILE → LOCALAPPDATA\Zuberi
- `.openclaw.local.json` lives at repo root (dev) and `C:\Users\PLUTO\.openclaw.local.json` (production fallback)
- Ollama health check: `check_ollama_live()` → GET `http://127.0.0.1:11434/api/tags` with 2s timeout (Rust/reqwest)
- Ollama auto-launch: `ensure_ollama()` checks liveness, spawns `ollama serve` if needed, polls 15×1000ms
- `launch_ollama()` uses full path `C:\Users\PLUTO\AppData\Local\Programs\Ollama\ollama.exe`
- `launch_ollama()` sets `OLLAMA_ORIGINS=http://tauri.localhost` on the spawned process
- `launch_ollama()` uses `CREATE_NO_WINDOW` (0x08000000) to suppress terminal window
- `ensure_ollama()` uses `tokio::time::sleep` — never `std::thread::sleep` in async
- Success verified by HTTP health check on `/api/tags` only, not tray icon presence
- Failure path: `%LOCALAPPDATA%\Ollama\server.log` and app.log
- Frontend `src/lib/ollama.ts` wraps Tauri IPC calls with try/catch (graceful fail in vitest)
- `ModelSelector.tsx` shows "Ollama is not running" + Start/Retry UI when `ollamaDown && models.length === 0`
- `ensure_environment()` orchestrator: Ollama (blocking) → `check_custom_model()` → `check_openclaw()`, returns JSON `{ollama, model, openclaw}`
- `check_custom_model()` queries `/api/tags` for `"qwen3:14b-fast"`, rebuilds from `C:\Users\PLUTO\Modelfile.qwen3-14b-fast` if missing
- `check_openclaw()` health checks `http://127.0.0.1:18789` — accepts 200 or 401 as healthy
- `ClawdChatInterface.tsx` calls `ensureEnvironment()` on mount — processes `EnvironmentStatus` result for ollama/model/openclaw
- `ensureEnvironment()` in `ollama.ts` uses static import of `invoke` — do NOT use dynamic `await import()` (breaks production build)
- NSIS installer: always install the LATEST .exe in `src-tauri\target\release\bundle\nsis\` — old versions may coexist
- Modelfile think scaffolding: removing the assistant-side prefill block (think tags) from TEMPLATE is the correct fix for "NO" prefix
- PARAMETER think false is NOT a supported Modelfile param in current Ollama — do not add it
- If "NO" persists after template fix, inspect OpenClaw request payload for think field overrides — request-level think controls are separate from template
- Modelfile backup always at `C:\Users\PLUTO\Modelfile.qwen3-14b-fast.bak`
- `check_custom_model()` checks presence only, not template correctness — known gap
- Heartbeat disabled (`every: "0m"`) in `openclaw.json` `agents.defaults.heartbeat` — was colliding with interactive chat session
- Root cause: heartbeat ran on `agent:main:main` same session as user chat
- Re-enable only after separate session routing is confirmed in OpenClaw config
- seq gap WS error in ZuberiChat still needs fixing (RTL-042b)

## Key File Locations

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | App version, CSP, window config, bundle config |
| `src-tauri/Cargo.toml` | Rust deps: tauri 2, serde, single-instance, process, opener, reqwest, tokio |
| `src-tauri/capabilities/default.json` | Tauri v2 permissions (core, window, process, opener) |
| `src-tauri/src/main.rs` | Tauri commands: read_gateway_token, open_url_in_browser, toggle_devtools, save_upload, sync_to_ceg, check_ollama_live, launch_ollama, ensure_ollama, check_custom_model, check_openclaw, ensure_environment |
| `src/lib/ollama.ts` | Frontend wrappers for Tauri IPC (ensureOllama, launchOllama, ensureEnvironment) |
| `src/components/layout/Sidebar.tsx` | 3 items: New chat, Settings, Kanban Board |
| `src/components/layout/Titlebar.tsx` | Window controls, sidebar toggle, UsageMeter, keyboard shortcuts |
| `src/components/layout/ZuberiContextMenu.tsx` | Right-click menu: File, Kanban, Edit, View, Help (About Zuberi) |
| `src/components/chat/ModelSelector.tsx` | Dropdown model picker, fetches from Ollama, preloads to GPU |
| `src/components/chat/ClawdChatInterface.tsx` | Main chat component, WebSocket to OpenClaw, fetchModels, drag-drop |
| `src/App.tsx` | Root component, sidebar state, Titlebar + Sidebar + ClawdChatInterface |
| `src/test/smoke.test.tsx` | 13 smoke tests |
| `package.json` | Version 0.1.1, key deps: tauri-apps/api, react 19, vite 6, vitest 4 |
| `scripts/verify-build.ps1` | Post-build binary verification (checks CSP strings embedded in exe) |
| `.openclaw.local.json` | Gateway token for OpenClaw WebSocket (repo root, copied to USERPROFILE for prod) |

## Last 5 Commits

```
50b260b RTL-042a: Disable heartbeat — session collision fix
70fdad1 RTL-041: Fix NO prefix — remove think scaffolding from Modelfile template
2427039 RTL-040: Self-healing startup — conditional model check + OpenClaw health
5f15e39 RTL-039b: Silent Ollama launch, tokio sleep, health-check verification
330079f RTL-039: Ollama health check and auto-launch on startup
```

## Do Not Touch

- **GitHub Actions:** deleted entirely (commit `8f18317`) — do not recreate
- **Tauri updater:** stripped (commit `8f18317`) — do not re-add `tauri-plugin-updater`, `useUpdater.ts`, or `updater:default` capability
- **src-tauri/capabilities/default.json:** do not add `http:` scope here; CSP is in `app.security.csp`
- **Model selector disabled condition:** do not add `models.length === 0` — causes chicken-and-egg bug
- **OLLAMA_ORIGINS env var:** `http://tauri.localhost,http://localhost:3000` — set at User level on KILO. Do NOT add `tauri://localhost` (causes Ollama CORS library panic)

## Pre-flight Checklist (run before any task)

1. `pnpm test` — must be 13/13
2. Kill any running `pnpm tauri dev` process
3. Read this file
4. Check `git log --oneline -3` to confirm repo state
5. Check `git status` for uncommitted changes
6. After `pnpm tauri build`, run `scripts\verify-build.ps1` before installing. If any check fails, do not install — fix and rebuild first.

## Last Task Completed

RTL-042a: Disable OpenClaw heartbeat — session collision fix.
- No heartbeat key existed in openclaw.json — added `agents.defaults.heartbeat.every: "0m"`
- JSON validated, OpenClaw restarted, health check 200 (healthy)
- Heartbeat was colliding with interactive chat on same `agent:main:main` session
- seq gap WS error still needs fix (RTL-042b)

## Next Task

RTL-034: Local version poller — poll `version.json` in repo, show amber dot in
titlebar + version indicator in sidebar when installed version < repo version.
James clicks to authorize rebuild and relaunch.
