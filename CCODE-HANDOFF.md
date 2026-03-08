# ZuberiChat — ccode Handoff

**Updated:** 2026-03-08
**Repo:** C:\Users\PLUTO\github\Repo\ZuberiChat
**Installed version:** 0.1.1 (freshly installed from NSIS build)
**Repo version:** 0.1.1
**Smoke tests:** 116/116 (run `pnpm test` to verify)
**Pushed to remote:** Yes — `origin/main` is up to date with local `main`

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
- ModeSelector.tsx and ModelSelector.tsx dropdowns use bottom-anchor CSS positioning (`bottom: distFromBottom`) — always opens upward regardless of window size. Do NOT switch back to `top` + `translateY(-100%)` (breaks in non-fullscreen windows)
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
- `build.rs` watches `../.git/HEAD` and the current branch ref file so Cargo re-runs it on every new commit (prevents stale BUILD_COMMIT in incremental builds)
- `version.json` is a build artifact (gitignored), generated by `scripts/generate-version.ps1`
- `get_installed_version` uses `env!("APP_VERSION")` not `env!("CARGO_PKG_VERSION")` — Cargo.toml version differs from tauri.conf.json
- `read_repo_version` reads hardcoded path `C:\Users\PLUTO\github\Repo\ZuberiChat\version.json`, returns "repo_unavailable" on any error
- `read_repo_version` strips UTF-8 BOM (`\u{FEFF}`) before parsing — PowerShell 5.1 `Set-Content -Encoding UTF8` writes BOM by default
- `generate-version.ps1` uses `[System.IO.File]::WriteAllText()` with `UTF8Encoding($false)` to write BOM-free JSON
- VersionInfo struct: `{ version, commit, builtAt }` — camelCase via `#[serde(rename_all = "camelCase")]`
- Version poller frontend (RTL-034 Part 2): `useVersionPoller` hook polls `read_repo_version` every 60s, compares semver + commit
- Titlebar amber dot uses existing `.update-dot` CSS class (ember pulse animation), rendered only when `updateAvailable === true`
- Sidebar shows "Update available: vX.Y.Z" in amber (#f0a500) at bottom, only when update available
- `repo_unavailable` errors stay silent — no UI shown, just console warning
- Hook disables itself entirely if `get_installed_version` fails (vitest graceful)
- RTL-034 complete: Phase 1 (detect + indicate) + Phase 2 (one-click update trigger)
- `run_local_update` Rust command: spawns `cmd /c start "Zuberi Update" powershell -ExecutionPolicy Bypass -File update-local.ps1`
- `run_local_update` uses `CREATE_NO_WINDOW` (0x08000000) on the intermediary cmd.exe — `start` creates the visible PowerShell window
- Do NOT use `Command::new("powershell").creation_flags(CREATE_NEW_CONSOLE)` — fails to show a window when parent has piped stdio (e.g. `pnpm tauri dev` pipeline via cargo)
- `update-local.ps1` pipeline: `pnpm test` → `pnpm tauri build` → `generate-version.ps1` → `verify-build.ps1` → find newest NSIS installer → launch installer
- `update-local.ps1` logs all output to `logs/update.log` in repo root
- NSIS installer search order: `*setup*.exe` → `*Setup*.exe` → any `*.exe` in `src-tauri/target/release/bundle/nsis/`
- Sidebar "Update available" indicator is a clickable `<button>` — shows `window.confirm()`, calls `invoke('run_local_update')`, shows "Updating..." while running
- Titlebar amber dot is a clickable `<button>` — same confirm+invoke pattern, dot turns gray (muted) when updating
- Both update buttons use local `useState(false)` for `updating` state — no global state needed

## Browser-Safe Preview Mode

The app renders at `localhost:3000` in a plain browser (no Tauri) using the official `@tauri-apps/api/mocks` module. This lets the agent screenshot, inspect DOM, and verify CSS without needing the Tauri native window.

**How it works:**
- `src/lib/platform.ts` provides `isTauri()` detection and `installBrowserMocks()` which patches `window.__TAURI_INTERNALS__` with mock IPC handlers
- `src/main.tsx` gates mock install on `!isTauri()` before React mounts, plus wraps `<App />` in an ErrorBoundary
- Zero changes to any of the 8 files that import Tauri APIs — mocks are transparent
- In real Tauri mode: `isTauri()` returns true, mocks never installed, zero regression

**Usage (for agent):**
1. `preview_start browser-preview` (config in `C:\.claude\launch.json`)
2. Navigate to `http://localhost:3000` if page shows chrome-error
3. `preview_screenshot` / `preview_snapshot` / `preview_inspect` for UI verification

**What renders:** Titlebar (sidebar toggle, "Zuberi", UsageMeter, window buttons), Sidebar (New chat, Settings, Kanban Board), Chat area (input, send, model selector, attach), "Connection lost" banner (expected — OpenClaw WS unavailable), "no model" in status bar (expected — Ollama unavailable)

**What doesn't work:** WebSocket to OpenClaw (shows "Connection lost"), Ollama model list (shows last-used model from localStorage), window drag/minimize/maximize/close (no-op clicks), process exit (no-op)

## Key File Locations

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | App version, CSP, window config, bundle config |
| `src-tauri/Cargo.toml` | Rust deps: tauri 2, serde, single-instance, process, opener, reqwest, tokio |
| `src-tauri/capabilities/default.json` | Tauri v2 permissions (core, window, process, opener) |
| `src-tauri/src/main.rs` | Tauri commands: read_gateway_token, open_url_in_browser, toggle_devtools, save_upload, sync_to_ceg, check_ollama_live, launch_ollama, ensure_ollama, check_custom_model, check_openclaw, ensure_environment, get_installed_version, read_repo_version, run_local_update |
| `src-tauri/build.rs` | Build script: embeds APP_VERSION, BUILD_COMMIT, BUILD_TIMESTAMP at compile time |
| `scripts/generate-version.ps1` | Pre-build script: generates version.json from tauri.conf.json + git |
| `scripts/update-local.ps1` | One-click update: test → build → verify → find NSIS installer → launch |
| `src/lib/platform.ts` | Tauri runtime detection (`isTauri()`) and browser preview mocks (`installBrowserMocks()`) |
| `src/lib/ollama.ts` | Frontend wrappers for Tauri IPC (ensureOllama, launchOllama, ensureEnvironment) |
| `src/hooks/useVersionPoller.ts` | Version polling hook: 60s poll, semver compare, update detection |
| `src/components/layout/Sidebar.tsx` | 3 items: New chat, Settings, Kanban Board + clickable update indicator |
| `src/components/layout/Titlebar.tsx` | Window controls, sidebar toggle, UsageMeter, clickable amber dot, keyboard shortcuts |
| `src/components/layout/ZuberiContextMenu.tsx` | Right-click menu: File, Kanban, Edit, View, Help (About Zuberi) |
| `src/types/permissions.ts` | Permission mode types, approval record definitions, mode-to-execAsk mapping |
| `src/lib/permissionPolicy.ts` | Approval request normalization and auto-resolution policy engine |
| `src/components/chat/ModeSelector.tsx` | Controlled permission mode dropdown (4 modes, icons, descriptions, upward-opening) |
| `src/components/chat/ModelSelector.tsx` | Dropdown model picker, fetches from Ollama, preloads to GPU |
| `src/components/chat/ClawdChatInterface.tsx` | Main chat component, WebSocket to OpenClaw, fetchModels, drag-drop |
| `src/App.tsx` | Root component, sidebar state, version poller, Titlebar + Sidebar + ClawdChatInterface |
| `src/test/smoke.test.tsx` | 13 smoke tests |
| `src/test/permissions.test.tsx` | 103 permission tests (normalization, classification, policy, ModeSelector component) |
| `package.json` | Version 0.1.1, key deps: tauri-apps/api, react 19, vite 6, vitest 4 |
| `scripts/verify-build.ps1` | Post-build binary verification (checks CSP strings embedded in exe) |
| `.openclaw.local.json` | Gateway token for OpenClaw WebSocket (repo root, copied to USERPROFILE for prod) |

## Last 5 Commits

```
6464ab6 UI polish: remove gear icon, square input corners, upward dropdowns, color token discipline
7eab821 Add browser-safe preview mode for UI development
1abd3c2 RTL-034: Force Cargo to re-embed BUILD_COMMIT on every new commit
e6a153a RTL-034: Fix post-install version metadata sync
7a1cb2c RTL-034: Fix update script stderr handling
```

## Do Not Touch

- **GitHub Actions:** deleted entirely (commit `8f18317`) — do not recreate
- **Tauri updater:** stripped (commit `8f18317`) — do not re-add `tauri-plugin-updater`, `useUpdater.ts`, or `updater:default` capability
- **src-tauri/capabilities/default.json:** do not add `http:` scope here; CSP is in `app.security.csp`
- **Model selector disabled condition:** do not add `models.length === 0` — causes chicken-and-egg bug
- **OLLAMA_ORIGINS env var:** `http://tauri.localhost,http://localhost:3000` — set at User level on KILO. Do NOT add `tauri://localhost` (causes Ollama CORS library panic)

## Pre-flight Checklist (run before any task)

1. `pnpm test` — must be 116/116
2. Kill any running `pnpm tauri dev` process
3. Read this file
4. Check `git log --oneline -3` to confirm repo state
5. Check `git status` for uncommitted changes
6. After `pnpm tauri build`, run `scripts\verify-build.ps1` before installing. If any check fails, do not install — fix and rebuild first.

## RTL-046 Color Token Polish

**What was cleaned up:**
- Sidebar update amber `#f0a500` → `var(--ember)` (was drifting from canonical `#f0a020`)
- Send button coral `#D9654B` → `var(--send-bg)` `#b87a3a` (warm forged metal, fits ember/obsidian)
- GPU status cool gray `#6b7280` → `var(--text-muted)`, green `#4ade80` → `var(--status-success)`
- Input text `#e6dbcb` → `var(--accent-primary)`, placeholder `#7a7977` → `var(--text-placeholder)`
- Input container bg `#2b2a28` → `var(--surface-2)`, borders `#3a3938` → `var(--surface-interactive)`
- ModeSelector hardcoded `#4a4947`/`#2b2a28`/`#b0afae` → tokens
- ModelSelector `#f0a020` hardcodes → `var(--ember)`, `#c03030` → `var(--status-danger)`, retry button `#3a3938`/`#4a4947` → interactive surface tokens
- FileAttachments chip bg `#3a3938` → `var(--surface-interactive)`, text `#d5cbbd` → `var(--accent-primary)`, upload indicator `#f0a020` → `var(--ember)`, remove button and attach button colors → token-based CSS classes
- Message colors `#f0a020`/`#eae9e9` → `var(--ember)`/`var(--text-primary)`
- Drag overlay ember hardcodes → `var(--ember)`

**New semantic tokens added to `:root`:**
- `--text-placeholder: #7a7977`
- `--surface-interactive: #3a3938`
- `--surface-interactive-hover: #4a4947`
- `--surface-interactive-disabled: #2e2c2a`
- `--border-interactive: #4a4947`
- `--status-success: #4ade80`
- `--status-warning: #f0a020`
- `--status-danger: #c03030`
- `--send-bg: #b87a3a`
- `--send-bg-hover: #c8863f`

**New CSS classes in globals.css:**
- `.attach-btn` / `.attach-btn:hover` — attach button color states
- `.file-chip-remove` / `.file-chip-remove:hover` — file chip X button
- `.chat-input` / `.chat-input::placeholder` — input text + placeholder

**Intentionally left bespoke:**
- ConnectionStatus diamond SVG facet colors (illustration-specific, not UI chrome)
- UsageMeter gauge colors (functional dashboard palette: green/amber/red thresholds)
- Titlebar close button red `#e81123`/`#c50f1f` (Windows convention)
- Kanban panel scoped CSS variables (isolated design system)

## RTL-047 Phase 1: Functional Permission Selector with Approval Handling

**What was built:**
ModeSelector is now a functional permission selector connected to OpenClaw's exec-approval protocol. Phase 1 covers mode mapping, auto-resolution, and approval event handling. Phase 2 (later) will add the ToolApprovalCard UI for pending approvals with user interaction.

**4 permission modes:**

| UI Label | Frontend value | Backend execAsk | Frontend behavior |
|----------|---------------|-----------------|-------------------|
| Ask permissions | `ask` | `on-miss` | Show approval cards, user decides |
| Auto accept edits | `auto` | `on-miss` | Auto-allow-once read/write/patch, ask for destructive/exec |
| Plan mode | `plan` | `always` | Auto-deny all approvals |
| Bypass permissions | `bypass` | `off` | No approvals requested by backend |

Note: "Auto accept edits" and "Ask permissions" send the SAME `execAsk` (`on-miss`) to backend. The difference is frontend-only: auto mode resolves safe approvals automatically.

**New files:**
- `src/types/permissions.ts` — PermissionMode, ApprovalRecord, ApprovalStatus, PERMISSION_MODE_TO_EXEC_ASK mapping
- `src/lib/permissionPolicy.ts` — normalizeApprovalRequest() command classifier + resolveApprovalDecision() policy engine
- `src/test/permissions.test.tsx` — 103 tests (normalization, category classification, policy matrix, ModeSelector component)

**Modified files:**
- `src/components/chat/ModeSelector.tsx` — Rewritten as controlled component (props: `mode`, `onModeChange`). 4 modes with Lucide icons (ShieldCheck, Code, FileText, AlertTriangle). Bypass description in `--status-danger` color. Checkmark on selected mode.
- `src/components/chat/ClawdChatInterface.tsx` — Added permissionMode state (localStorage persisted), permissionModeRef, approval event handlers (exec.approval.requested/resolved), auto-resolution via policy engine, 120s timeout tracking, sessions.patch RPC on mode change

**Architecture decisions:**
- ModeSelector is purely presentational — parent (ClawdChatInterface) owns all state and RPC
- `permissionModeRef` used for stable access in WS callbacks without stale closures
- Approvals stored in `approvalsRef` (Map<string, ApprovalRecord>) — not in React state (no UI yet for Phase 1)
- Timeout timers tracked in `approvalTimersRef` for cleanup on resolution
- Auto-resolved approvals send `exec.approval.resolve` RPC immediately via `sendRef.current`
- Pending approvals (ask mode) set up setTimeout → mark 'expired' after 120s

**OpenClaw protocol facts (discovered during RTL-047):**
- OpenClaw source at `C:\Users\PLUTO\github\openclaw\` (TypeScript/Node.js monorepo)
- `exec-approval.ts` — full approval protocol, 10K+ lines
- Events: `exec.approval.requested` (server→client), `exec.approval.resolved` (server→client)
- RPC: `exec.approval.resolve` with decisions: `allow-once` | `allow-always` | `deny`
- `execAsk` session field: `"off"` | `"on-miss"` | `"always"` — set via `sessions.patch`, invalid values rejected
- Backend-enforced execution — frontend cannot block, only approve/deny when asked
- Zuberi already has `operator.approvals` scope (line 42 of ClawdChatInterface.tsx)
- No native "plan mode" in OpenClaw — achieved via `execAsk: "always"` + frontend auto-deny

**Phase 2 TODO:**
- ToolApprovalCard UI component for pending approvals in ask mode
- User interaction (approve/deny buttons) with visual feedback
- Integration with message stream (show approval cards inline)

## Last Session Summary

Session completed the following work (in order):
1. **RTL-047 Phase 1: Functional Permission Selector** — Built complete permission system: types, policy engine, controlled ModeSelector, approval event handling with auto-resolution, 120s timeout, localStorage persistence, sessions.patch RPC
2. **103 new tests** — Normalization, command classification (60+ commands), policy matrix (all 4 modes × 6 categories), ModeSelector component rendering and interaction
3. **Browser preview verified** — All 4 modes render with correct icons, descriptions, and danger color on bypass

All 116/116 tests passing (13 smoke + 103 permissions).

## Next Task

RTL-047 Phase 2: ToolApprovalCard UI for pending approvals with user interaction.
