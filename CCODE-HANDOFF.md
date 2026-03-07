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
- Workspace .md "no-think" framing was stale after RTL-041 Modelfile fix — replaced with "fast" in AGENTS.md, MEMORY.md, TOOLS.md
- "no-think" in system prompt may cause model to echo "NO" on first turn before conversational pattern is established
- qwen3:14b-fast now thinks natively via template — "no-think" label is factually wrong post-RTL-041
- Workspace files edited: AGENTS.md (2 lines), MEMORY.md (3 lines), TOOLS.md (2 lines). HEARTBEAT.md and SOUL.md unchanged.
- Pre-compaction memory flush re-enabled after tuning for 32K context (RTL-042d)
- Compaction settings (tuned for 32K): mode=safeguard, reserveTokensFloor=4000 (12% of 32K), softThresholdTokens=2000, memoryFlush.enabled=true
- Old values (tuned for 200K): reserveTokensFloor=20000 (61% of 32K), softThresholdTokens=4000 — flush triggered at only 8768 tokens, workspace files consumed most of that
- New flush trigger: 32768 - 4000 - 2000 = 26768 tokens before flush fires — gives model full working space
- contextWindow is per-model only in openclaw.json (all 4 models at 32768), no global setting
- OpenClaw model catalog: qwen3:14b-fast, qwen3:14b, qwen3-vl:8b-fast, gpt-oss:20b — synced to installed Ollama models (RTL-043)
- Removed qwen3-vl:8b from catalog, replaced with qwen3-vl:8b-fast; added qwen3:14b
- reasoning: false for all configured models — do not enable without explicit instruction
- Version poller backend (RTL-034 Part 1): `get_installed_version` returns compile-time embedded version/commit/timestamp; `read_repo_version` reads `version.json` from repo root
- `build.rs` embeds APP_VERSION (from tauri.conf.json), BUILD_COMMIT (git short hash), BUILD_TIMESTAMP (UTC ISO 8601) at compile time
- `version.json` is a build artifact (gitignored), generated by `scripts/generate-version.ps1`
- `get_installed_version` uses `env!("APP_VERSION")` not `env!("CARGO_PKG_VERSION")` — Cargo.toml version differs from tauri.conf.json
- `read_repo_version` reads hardcoded path `C:\Users\PLUTO\github\Repo\ZuberiChat\version.json`, returns "repo_unavailable" on any error
- VersionInfo struct: `{ version, commit, builtAt }` — camelCase via `#[serde(rename_all = "camelCase")]`
- Version poller frontend (RTL-034 Part 2): `useVersionPoller` hook polls `read_repo_version` every 60s, compares semver + commit
- Titlebar amber dot uses existing `.update-dot` CSS class (ember pulse animation), rendered only when `updateAvailable === true`
- Sidebar shows "Update available: vX.Y.Z" in amber (#f0a500) at bottom, only when update available
- `repo_unavailable` errors stay silent — no UI shown, just console warning
- Hook disables itself entirely if `get_installed_version` fails (vitest graceful)
- Phase 1 complete — detect and indicate only, no rebuild/relaunch functionality

## Key File Locations

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | App version, CSP, window config, bundle config |
| `src-tauri/Cargo.toml` | Rust deps: tauri 2, serde, single-instance, process, opener, reqwest, tokio |
| `src-tauri/capabilities/default.json` | Tauri v2 permissions (core, window, process, opener) |
| `src-tauri/src/main.rs` | Tauri commands: read_gateway_token, open_url_in_browser, toggle_devtools, save_upload, sync_to_ceg, check_ollama_live, launch_ollama, ensure_ollama, check_custom_model, check_openclaw, ensure_environment, get_installed_version, read_repo_version |
| `src-tauri/build.rs` | Build script: embeds APP_VERSION, BUILD_COMMIT, BUILD_TIMESTAMP at compile time |
| `scripts/generate-version.ps1` | Pre-build script: generates version.json from tauri.conf.json + git |
| `src/lib/ollama.ts` | Frontend wrappers for Tauri IPC (ensureOllama, launchOllama, ensureEnvironment) |
| `src/hooks/useVersionPoller.ts` | Version polling hook: 60s poll, semver compare, update detection |
| `src/components/layout/Sidebar.tsx` | 3 items: New chat, Settings, Kanban Board + version indicator |
| `src/components/layout/Titlebar.tsx` | Window controls, sidebar toggle, UsageMeter, amber dot, keyboard shortcuts |
| `src/components/layout/ZuberiContextMenu.tsx` | Right-click menu: File, Kanban, Edit, View, Help (About Zuberi) |
| `src/components/chat/ModelSelector.tsx` | Dropdown model picker, fetches from Ollama, preloads to GPU |
| `src/components/chat/ClawdChatInterface.tsx` | Main chat component, WebSocket to OpenClaw, fetchModels, drag-drop |
| `src/App.tsx` | Root component, sidebar state, version poller, Titlebar + Sidebar + ClawdChatInterface |
| `src/test/smoke.test.tsx` | 13 smoke tests |
| `package.json` | Version 0.1.1, key deps: tauri-apps/api, react 19, vite 6, vitest 4 |
| `scripts/verify-build.ps1` | Post-build binary verification (checks CSP strings embedded in exe) |
| `.openclaw.local.json` | Gateway token for OpenClaw WebSocket (repo root, copied to USERPROFILE for prod) |

## Last 5 Commits

```
31f00a5 RTL-034 Part 2: Frontend version polling and update indicators
dcbad3d RTL-034 Part 1: Version poller backend + version.json generation
dc05fdc RTL-043: Sync OpenClaw model catalog with installed Ollama models
f6d53da RTL-042d: Tune compaction for 32K context + re-enable memory flush
dbf2363 RTL-042c: Disable pre-compaction memory flush — fast falsification test
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

RTL-034 Part 2: Frontend version polling and update indicators.
- New file: `src/hooks/useVersionPoller.ts` — 60s poll loop, semver compare, graceful vitest fallback
- Modified: `src/App.tsx` — wired `useVersionPoller` hook, passes `updateAvailable`/`availableVersion` to Titlebar + Sidebar
- Modified: `src/components/layout/Titlebar.tsx` — amber dot (`.update-dot` CSS) between UsageMeter and minimize, `pointerEvents: 'none'`
- Modified: `src/components/layout/Sidebar.tsx` — "Update available: vX.Y.Z" in amber (#f0a500) after Kanban Board
- Polling: 60s interval, `read_repo_version` IPC, custom semver comparison (no library)
- `repo_unavailable` stays silent — console warning only, no UI
- Hook self-disables if `get_installed_version` fails (vitest graceful)
- Phase 1 complete — detect and indicate only, no rebuild/relaunch
- 13/13 smoke tests pass, `pnpm tauri dev` builds and launches cleanly

## Next Task

None queued — RTL-034 complete (both parts).
