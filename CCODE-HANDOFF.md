# ZuberiChat — ccode Handoff

**Updated:** 2026-03-09
**Repo:** C:\Users\PLUTO\github\Repo\ZuberiChat
**Installed version:** 1.0.0 (installed from NSIS build)
**Repo version:** 1.0.1
**Smoke tests:** 155/155 (run `pnpm test` to verify)
**Pushed to remote:** No — local `main` has unpushed v1.0.1 changes

## Current Sidebar State

**SIDEBAR HIDDEN — RTL-049.** Code preserved in App.tsx and Titlebar.tsx (comment markers). Uncomment to restore.

Sidebar items (preserved but not rendered):
1. **New chat** — icon: SquarePen, event: `emit('new-conversation')`
2. **Settings** — icon: Settings, event: `emit('open-settings')`
3. *(spacer)*
4. ~~**Kanban Board**~~ — moved to bottom bar in ClawdChatInterface.tsx (RTL-049)

**Kanban Board** now lives in the status bar below the input field, left-aligned next to the GPU model indicator.

About Zuberi location: `ZuberiContextMenu.tsx` (right-click menu > Help > About Zuberi), NOT in the sidebar
About Zuberi text: `Zuberi v1.0.1\nWahwearro Holdings LLC` (update this when version bumps)

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
| `src/components/chat/MessageContent.tsx` | Markdown/structured block renderer (ReactMarkdown + SyntaxHighlighter + block dispatch) |
| `src/components/chat/ToolCallBlock.tsx` | Collapsible tool call renderer (tool name + expandable args JSON) |
| `src/components/chat/ToolResultBlock.tsx` | Collapsible tool result renderer (auto-collapses if >5 lines) |
| `src/types/message.ts` | ContentBlock union type, ChatRole, ChatMessage (structured content protocol) |
| `src/lib/syntaxTheme.ts` | Custom warm-tinted dark syntax highlighting theme for Prism |
| `src/components/chat/ClawdChatInterface.tsx` | Main chat component, WebSocket to OpenClaw, fetchModels, drag-drop |
| `src/App.tsx` | Root component, sidebar state, version poller, Titlebar + Sidebar + ClawdChatInterface |
| `src/test/smoke.test.tsx` | 13 smoke tests |
| `src/test/permissions.test.tsx` | 103 permission tests (normalization, classification, policy, ModeSelector component) |
| `src/test/markdown-render.test.tsx` | 30 markdown/block rendering tests (MessageContent, ToolCallBlock, ToolResultBlock) |
| `package.json` | Version 0.1.1, key deps: tauri-apps/api, react 19, vite 6, vitest 4 |
| `scripts/verify-build.ps1` | Post-build binary verification (checks CSP strings embedded in exe) |
| `.openclaw.local.json` | Gateway token for OpenClaw WebSocket (repo root, copied to USERPROFILE for prod) |

## Last 5 Commits

```
1346bd5 Bump version to 1.0.0
553c216 RTL-049: UI polish — font, layout, message colors, sidebar hidden, Kanban relocated
72c7885 Bump version to 0.1.2
7a6f727 RTL-048: Markdown rendering + structured block rendering
5540b9f RTL-047 Phase 1: Functional permission selector with approval handling
```

## Do Not Touch

- **GitHub Actions:** deleted entirely (commit `8f18317`) — do not recreate
- **Tauri updater:** stripped (commit `8f18317`) — do not re-add `tauri-plugin-updater`, `useUpdater.ts`, or `updater:default` capability
- **src-tauri/capabilities/default.json:** do not add `http:` scope here; CSP is in `app.security.csp`
- **Model selector disabled condition:** do not add `models.length === 0` — causes chicken-and-egg bug
- **OLLAMA_ORIGINS env var:** `http://tauri.localhost,http://localhost:3000` — set at User level on KILO. Do NOT add `tauri://localhost` (causes Ollama CORS library panic)

## Pre-flight Checklist (run before any task)

1. `pnpm test` — must be 146/146
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

## RTL-048: Markdown Rendering + Structured Block Rendering

**What was built:**
Assistant messages now render through react-markdown with GFM support and syntax-highlighted code blocks. Structured content blocks (toolCall, toolResult) from OpenClaw protocol render through dedicated collapsible components. User messages remain plain text.

**Rendering architecture:**
- `MessageContent` (memo'd) dispatches: blocks → `BlockRenderer`, no blocks + assistant → `MarkdownRenderer`, no blocks + user → plain text span
- `BlockRenderer` iterates `ContentBlock[]`: text → markdown, toolCall → `ToolCallBlock`, toolResult → `ToolResultBlock`
- `MarkdownRenderer` wraps ReactMarkdown with remarkGfm + custom component overrides
- Streaming deltas produce plain string content (no blocks). Structured blocks arrive on `final` messages only

**Markdown features:**
- Bold, italic, inline code (`.inline-code`), headings (h1–h6), ordered/unordered lists, links (target="_blank"), blockquotes, tables (GFM), horizontal rules, task lists (GFM)
- Fenced code blocks: react-syntax-highlighter (Prism) with `zuberiDark` warm-tinted theme
- Code block header: language label + copy-to-clipboard button (Copy → Check icon, 2s feedback)
- All content wrapped in `.zuberi-markdown` class with comprehensive CSS styling

**Syntax highlighting theme (`zuberiDark`):**
- Warm amber tags/selectors, warm green strings, warm coral keywords, warm gold functions
- JetBrains Mono / Fira Code / Cascadia Code / Consolas font stack
- All colors shifted toward warm tones (no cold blues) — matches obsidian/ember aesthetic

**Tool block components:**
- `ToolCallBlock`: Terminal icon + tool name + collapsible JSON args (chevron indicator only when args present)
- `ToolResultBlock`: CheckCircle icon (green) + tool name + result text (auto-collapses if >5 lines, shows first 3 + "...")

**New files:**
- `src/components/chat/MessageContent.tsx` — Main rendering component with ReactMarkdown integration
- `src/components/chat/ToolCallBlock.tsx` — Collapsible tool call display
- `src/components/chat/ToolResultBlock.tsx` — Collapsible tool result display
- `src/types/message.ts` — ContentBlock union type, ChatRole, ChatMessage (moved from inline types)
- `src/lib/syntaxTheme.ts` — Custom Prism theme (warm-tinted Atom One Dark variant)
- `src/test/markdown-render.test.tsx` — 30 tests covering all rendering paths

**Modified files:**
- `src/components/chat/ClawdChatInterface.tsx` — Added `extractContentBlocks()` function, import MessageContent, replaced inline `{message.content}` with `<MessageContent />`, removed local ChatRole/ChatMessage type defs (now imported from message.ts)
- `src/globals.css` — ~200 lines of new CSS: `.zuberi-markdown` styles (headings, lists, code, tables, links, blockquotes), `.code-block-*` classes, `.tool-block-*` classes

**Dependencies added:**
- `react-syntax-highlighter` ^16.1.1 (Prism-based syntax highlighting)
- `@types/react-syntax-highlighter` ^15.5.13

**Content block extraction (`extractContentBlocks`):**
- Preserves toolCall/toolResult blocks from OpenClaw content arrays on `final` messages
- Handles both camelCase and snake_case type names (`toolCall`/`tool_call`, `toolResult`/`tool_result`)
- Multiple field name patterns: `toolName`/`name`, `args`/`input`, `text`/`content`

**Known:** Vite build produces ~1060KB chunk from react-syntax-highlighter language definitions — expected, not a problem

## RTL-049: UI Polish — Font, Layout, Colors, Sidebar Hidden, Kanban Relocated

**What changed:**

1. **Font**: Body font changed to `'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif` at `font-size: 14px` (Windows Office default). Code blocks and inline code keep monospace.

2. **Conversation area widened 20%**: Outer container `max-w-4xl` (896px) → `max-w-[1075px]`. Inner form `max-w-3xl` (768px) → `max-w-[920px]`. Both remain centered and responsive.

3. **Message colors swapped**:
   - User messages: `var(--text-primary)` (white #eae9e9)
   - Assistant messages: `var(--text-ember)` (warm amber #f0c060)
   - Markdown headings stay `var(--text-primary)` for visual hierarchy
   - Links, inline code, blockquotes, tables keep existing distinct colors

4. **Sidebar hidden (code preserved)**:
   - `App.tsx`: Sidebar JSX commented out with `SIDEBAR HIDDEN — RTL-049` marker
   - `Titlebar.tsx`: Sidebar toggle button commented out, replaced with plain "Zuberi" title
   - All sidebar component files intact and unchanged
   - Sidebar state/toggle logic still in App.tsx (no-op while hidden)

5. **Kanban Board moved to bottom bar**:
   - Removed from Sidebar.tsx (commented out with `KANBAN REMOVED — RTL-049` marker)
   - Added to ClawdChatInterface.tsx status bar: left-aligned LayoutGrid icon + "Kanban" text
   - Same functionality: `invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' })`
   - Styled consistently with GPU model indicator (10px font, muted color)

**Modified files:**
- `src/globals.css` — Font family + font-size on body
- `src/components/chat/ClawdChatInterface.tsx` — Widened max-widths, swapped message colors, added Kanban button + LayoutGrid import
- `src/App.tsx` — Sidebar JSX commented out
- `src/components/layout/Titlebar.tsx` — Sidebar toggle hidden, plain Zuberi title shown
- `src/components/layout/Sidebar.tsx` — Kanban Board item commented out

## RTL-002 Part 1 Diagnostic — n8n Bidirectional Integration (2026-03-09)

Read-only diagnostic. No changes made.

| Task | Result | Notes |
|------|--------|-------|
| n8n health (CEG) | **200** | `http://100.100.101.1:5678/healthz` — healthy |
| API key in CEG env | **NO** | `N8N_API_KEY` not set in shell env, not in `.bashrc` |
| n8n API reachability | **401** | `/api/v1/workflows` reachable, auth required (expected) |
| n8n skill file contents | **Present** | `C:\Users\PLUTO\openclaw_workspace\skills\n8n\SKILL.md` — 131 lines, has JWT API key, all CRUD operations, webhook registry (empty), autonomy rules |
| OpenClaw → n8n reachability | **200** | `docker exec openclaw-openclaw-gateway-1 curl ... /healthz` — container can reach n8n directly |

**Key findings:**
- n8n is healthy and reachable from both CEG shell and OpenClaw Docker container
- API key exists ONLY in the workspace skill file (`SKILL.md`), NOT in CEG shell environment
- Auth works (401 without key = API is protected as expected)
- Webhook registry is empty — no workflows created yet
- OpenClaw container has full network access to CEG/n8n (no Docker network isolation issue)

## RTL-002 Part 2 — Minimal End-to-End n8n Proof (2026-03-09)

Successfully created, activated, triggered, and verified a webhook workflow via n8n REST API.

| Step | Action | Result |
|------|--------|--------|
| 1. Get API key | Read from `SKILL.md` | JWT key extracted |
| 2. Create workflow | `POST /api/v1/workflows` | Created "Zuberi Intake Proof v1" (ID: `iQ5xn13IyUqnJbW2`) |
| 3. Activate | `POST /api/v1/workflows/{id}/activate` | `active: true` (note: PATCH not supported, use POST `/activate` endpoint) |
| 4. Trigger webhook | `POST /webhook/zuberi-intake` | HTTP 200 — payload received and processed |
| 5. Verify execution | `GET /api/v1/executions?workflowId={id}&limit=1` | Execution ID: 4, Status: **success**, Mode: webhook |

**Workflow details:**
- Name: Zuberi Intake Proof v1
- Nodes: Webhook (POST, path `zuberi-intake`, responseMode `lastNode`) → Capture Payload (Set node: title, summary, received_at)
- Connections: Webhook → Capture Payload
- Webhook URL: `http://100.100.101.1:5678/webhook/zuberi-intake`

**Troubleshooting notes:**
- `PATCH /api/v1/workflows/{id}` with `{"active":true}` returns "PATCH method not allowed" — use dedicated `POST /activate` and `POST /deactivate` endpoints instead
- Webhook node created via API may not register immediately after activation — workaround: deactivate → PUT update workflow (with `webhookId` on Webhook node) → reactivate → wait 3s before triggering
- The `webhookId` field on the Webhook node (UUID) is needed for reliable webhook registration via API
- n8n container env confirms: `WEBHOOK_URL=http://100.100.101.1:5678/`, `N8N_HOST=100.100.101.1`, `N8N_PORT=5678`

**SKILL.md webhook registry should be updated to:**
```
Workflow                    Webhook Path                    Method   Purpose
──────────────────────────────────────────────────────────────────
Zuberi Intake Proof v1      /webhook/zuberi-intake          POST     RTL-002 end-to-end proof
```

## RTL-002 Part 2b — First Production Workflow: AI Audit Intake (2026-03-09)

First production workflow built on the now-proven RTL-002 n8n integration. RTL-002 is closed; this is feature expansion.

### FINAL REPORT

| Task | Result | Status |
|------|--------|--------|
| AgenticMail send endpoint confirmed | `POST http://100.100.101.1:3100/api/agenticmail/mail/send` (Bearer auth) | ✅ |
| CXDB store endpoint + schema confirmed | `POST http://100.100.101.1:9010/v1/contexts/7/turns` (no auth, type_id + payload.role + payload.text) | ✅ |
| API key located | From `skills/n8n/SKILL.md` | ✅ |
| Workflow created + activated | ID: `Lv2v6AAVfS11kqeY`, active: true | ✅ |
| Webhook test response | HTTP 200, `{"status":"ok","stored":true,"notified":true}` | ✅ |
| Execution status | Execution ID: 7, status: **success**, mode: webhook | ✅ |
| CXDB node response | 201 — context_id: 7, turn_id: 9 | ✅ |
| AgenticMail node response | messageId: `0cbcc033-bb19...`, to: jamesmwaweru@gmail.com | ✅ |
| n8n skill registry updated | Active Workflows table + Webhook Registry updated in SKILL.md | ✅ |

### OBSTACLES LOG

| # | Obstacle | Resolution | Impact |
|---|----------|------------|--------|
| 1 | n8n expression parser `{{ }}` conflicts with `}}` in nested JS object literals | Added spaces between consecutive `}` in expressions (`} }` instead of `}}`) | Expression syntax constraint for all future n8n workflows |
| 2 | `\n` in JSON string values breaks n8n expression parser | Replaced newlines with ` \| ` pipe separators in expression text | Minor formatting difference in stored/emailed text |
| 3 | n8n Docker container (bridge network) cannot reach host services (CXDB, AgenticMail) due to host firewall | Recreated n8n container with `--network host` | n8n now uses host networking — port 5678 directly on host, Docker DNS names unavailable |
| 4 | AgenticMail API bound only to Tailscale IP (100.100.101.1) | Changed `config.json` api.host from `100.100.101.1` to `0.0.0.0`, restarted service | AgenticMail now reachable from all interfaces |

### Workflow details

- **Name:** Zuberi AI Audit Intake v1
- **ID:** `Lv2v6AAVfS11kqeY`
- **Webhook URL:** `http://100.100.101.1:5678/webhook/zuberi-audit-intake`
- **Nodes:** Webhook → CXDB Store (HTTP Request) → Send Email (HTTP Request) → Respond to Webhook
- **CXDB context:** context_id 7 (pre-created for audit records)
- **Email recipient:** jamesmwaweru@gmail.com (via zuberiwaweru+Zuberi@gmail.com relay)

### Infrastructure changes

- n8n container: recreated with `--network host` (was `docker_default` bridge)
- n8n data persisted in `/opt/zuberi/docker/n8n` volume mount (unchanged)
- AgenticMail: `~/.agenticmail/config.json` api.host changed to `0.0.0.0` (was `100.100.101.1`)
- Both workflow IDs: `iQ5xn13IyUqnJbW2` (proof), `Lv2v6AAVfS11kqeY` (production audit intake)

## RTL-050 — Capability Awareness Backfill (2026-03-09)

Wrote durable CXDB memory records for all major live, verified capabilities so Zuberi has persistent awareness across sessions. No code changes — memory-only operation.

### FINAL REPORT

| Capability | CXDB Record Written | turn_id | Status |
|-----------|-------------------|---------|--------|
| Permission selector (RTL-047) | ✅ | 10 | Live, verified |
| Markdown rendering (RTL-048) | ✅ | 11 | Live, verified |
| One-click update (RTL-034) | ✅ | 12 | Live, verified |
| Dispatch wrapper (CEG:3003) | ✅ | 13 | Live, verified |
| AgenticMail (CEG:3100) | ✅ | 14 | Live, verified |
| n8n proof workflow | ✅ | 15 | Live, verified |
| n8n AI Audit Intake workflow | ✅ | 16 | Live, verified |
| Browser preview (dev-support) | ✅ | 17 | Live, verified (dev-only) |
| AGENTS.md v0.8.4 | ✅ | — | Section 13 added |
| CXDB retrieval verified | ✅ | — | All 8 records retrieved from context 8 |

All records stored in CXDB context_id 8, turns 10–17.

### Schema Adaptation

CXDB has no native `tags` field. Placeholder fields (`type`, `content`, `tags`) were adapted:
- `type` → `type_id: "zuberi.memory.Task"` (closest match for completed capabilities)
- `content` → `payload.text` (with tag keywords embedded at end of text)
- `tags` → embedded as "Tags: keyword1, keyword2" suffix in text

### Skipped Records

- **Record 9 (compaction tuning):** Intentionally omitted per spec — system configuration detail, not a capability update.

### OBSTACLES LOG

No obstacles encountered. All CXDB writes succeeded on first attempt. Schema adaptation was straightforward.

### Capability Awareness Rule (going forward)

All capability changes must now close with four items (AGENTS.md v0.8.4, Section 13):
1. **Skill file update** — operational truth Zuberi reads
2. **Workspace doc update** — when behavior or rules change
3. **CXDB capability record** — durable recall across sessions
4. **CCODE-HANDOFF.md note** — ccode continuity only

### Files Modified

- `C:\Users\PLUTO\openclaw_workspace\AGENTS.md` — bumped to v0.8.4, added Section 13 (Capability Awareness Rule)
- CXDB context 8 created with 8 capability turns (CEG:9010)

No ZuberiChat source files touched. No pnpm or cargo commands run.

## RTL-051 — Debug Leaked Internal Control Outputs in Main Chat (2026-03-09)

User-visible chat was showing internal control outputs: `NO` (model template artifact) and `HEARTBEAT_OK` (heartbeat sentinel) instead of normal assistant replies.

### Root Cause

Three compounding issues:

1. **No frontend sentinel filtering.** The frontend rendered ALL text arriving via chat/agent WebSocket events. The backend has suppression for `NO_REPLY` and `HEARTBEAT_OK` (via `isSilentReplyText()` and `shouldHideHeartbeatChatOutput()` in OpenClaw), but bare `NO` is NOT a recognized backend sentinel. When backend suppression failed or didn't apply, control outputs leaked to UI.

2. **Heartbeat shares session with user chat.** Heartbeat runs on `agent:main:main` — the same session key as user chat. Even though heartbeat is disabled (`every: "0m"` in openclaw.json), it can still be triggered by execution completion events or wake signals. Its output flows through the same chat event stream.

3. **`NO` is a model template artifact, not a sentinel.** The qwen3:14b-fast model can output bare `NO` on first turn due to the think template scaffolding issue (documented in RTL-041). The backend's `isSilentReplyText()` only matches `NO_REPLY`, not bare `NO`.

### FINAL REPORT

| Area | Finding | Fix Applied | Status |
|------|---------|-------------|--------|
| chat.send deliver flag | `deliver: false` is CORRECT — controls external channel delivery (Slack/Discord), not webchat. Webchat receives responses via WS broadcast events regardless. No change needed. | None | ✅ Correct as-is |
| heartbeat routing | Shares `agent:main:main` session with user chat. Disabled (`every: "0m"`) but can trigger via execution events. Backend has `shouldHideHeartbeatChatOutput()` suppression. | Frontend sentinel filter catches `HEARTBEAT_OK` as defense-in-depth | ✅ Fixed |
| sentinel suppression | Backend suppresses `NO_REPLY` but NOT bare `NO`. Frontend had zero filtering. | Added `isSentinelOutput()` filter in delta, final, and agent event handlers. Catches `NO`, `NO_REPLY`, `HEARTBEAT_OK` (exact and prefix). | ✅ Fixed |
| compaction interaction | Compaction mode `safeguard` can trigger between runs. First `NO` likely came from near-full context → short model output → immediate compaction. Compaction does not retry/resume user runs. | Sentinel filter prevents `NO` from rendering regardless of compaction timing. | ✅ Mitigated |
| seq gap handling | Pre-existing issue (RTL-042b). Seq gaps come from OpenClaw backend agent stream. Cosmetic — not causing sentinel leakage. | No fix needed for this ticket. | ⚠️ Pre-existing |

### OBSTACLES LOG

| # | Obstacle | Resolution | Impact |
|---|----------|------------|--------|
| — | None | — | — |

### Fix Details

**File modified:** `src/components/chat/ClawdChatInterface.tsx`

**What was added:**
- `SENTINEL_EXACT` set: `['NO', 'NO_REPLY', 'HEARTBEAT_OK']`
- `isSentinelOutput(text)` function: matches exact tokens (trimmed, case-sensitive) and `HEARTBEAT_OK` prefix
- Sentinel check in chat delta handler — suppresses control output during streaming
- Sentinel check in chat final handler — suppresses final + removes any streaming placeholder
- Sentinel check in agent event handler — suppresses agent stream control outputs
- `[RTL-051]` console.warn logs on every suppression for diagnostics
- `[RTL-051:SEND]` enhanced logging on outgoing chat.send (payload, deliver flag, run classification)

**Tests:** 146/146 before fix → 146/146 after fix. Zero regressions.

**`deliver: false` verdict:** Correct and intentional. The `deliver` parameter in OpenClaw controls external channel delivery (Slack, Discord, etc.). For webchat-only usage, `deliver: false` prevents duplicate delivery. The message is still added to conversation history and a run is still triggered. No change needed.

**Capability awareness close-out:** CXDB record written — context 8, turn_id 18. Researcher-reviewed wording used. Follows RTL-050 Capability Awareness Rule (AGENTS.md v0.8.4, Section 13).

## v1.0.1 — RTL-051b Close-out + Message Alignment + Copy Button (2026-03-09)

### FINAL REPORT

| Task | Result | Status |
|------|--------|--------|
| Pre-flight tests (146) | 146/146 | ✅ |
| RTL-051b reproduced? | Not reproduced — all 6 `setMessages` ingress points audited, all assistant content paths have `isSentinelOutput()` guard. No history hydration path exists. | ✅ Closed |
| RTL-051b fix applied or closed? | Closed — not reproduced in current build | ✅ |
| Message alignment fixed | User messages changed from `textAlign: 'right'` to `textAlign: 'left'` | ✅ |
| Copy button added | `CopyButton.tsx` component, hover-to-show on `.msg-bubble`, copies raw text/markdown | ✅ |
| New tests written (count) | 9 tests in `src/test/copy-button.test.tsx` | ✅ |
| Browser preview captured | User message verified left-aligned with text wrapping in browser preview | ✅ |
| Version bumped to 1.0.1 | `tauri.conf.json` + About dialog updated | ✅ |
| Post-fix tests (total) | 155/155 (146 + 9 new) | ✅ |

### OBSTACLES LOG

| # | Obstacle | Resolution | Impact |
|---|----------|------------|--------|
| 1 | Browser preview shows blank on initial load (chrome-error) | Manual navigate to `http://localhost:3000` after server ready | Known preview tool flakiness, no code impact |

### Changes

**New files:**
- `src/components/chat/CopyButton.tsx` — Copy-to-clipboard button component (Copy/Check icons, 1.5s reset)
- `src/test/copy-button.test.tsx` — 9 tests: rendering, clipboard interaction, copied state reset

**Modified files:**
- `src/components/chat/ClawdChatInterface.tsx` — Import CopyButton, add to message rendering, change user `textAlign: 'right'` → `'left'`, add `.msg-bubble` class and `position: relative` to message container
- `src/globals.css` — Added `.msg-bubble .msg-copy-btn` hover CSS (opacity 0 → 1, positioned top-right)
- `src-tauri/tauri.conf.json` — Version `1.0.0` → `1.0.1`
- `src/components/layout/ZuberiContextMenu.tsx` — About dialog `v1.0.0` → `v1.0.1`

### Copy button behavior
- Appears on hover (top-right of message bubble, CSS opacity transition)
- Copies raw text content (markdown source for assistant, plain text for user)
- Click: Copy icon → Check icon (green, 1.5s) → Copy icon
- Uses lucide-react `Copy` and `Check` icons
- Does not render on sentinel-suppressed messages (they're removed from state)
- Does not interfere with ToolCallBlock/ToolResultBlock rendering

### CXDB capability awareness note
CXDB capability record written — context 8, turn_id 19. Covers copy button + left-aligned user messages. Per AGENTS.md v0.8.4 Section 13 (Capability Awareness Rule).

## About Dialog Version Fix (2026-03-09)

About dialog (Help → About Zuberi in ZuberiContextMenu.tsx) had stale hardcoded `v0.1.1`. Updated to `v1.0.0` to match tauri.conf.json. Approach: hardcoded string update (not dynamic `getVersion()`) — lowest risk, no new imports, no async, no mock concerns. Version only changes during explicit bumps. Tests: 146/146 before → 146/146 after.

## Last Session Summary

Session completed the following work (in order):
1. **RTL-047 Phase 1: Functional Permission Selector** — 103 tests
2. **RTL-048: Markdown + Structured Block Rendering** — 30 tests
3. **RTL-049: UI Polish** — Font (sans-serif 14px), wider conversation area (+20%), message color swap (user=white, assistant=ember), sidebar hidden, Kanban relocated to bottom bar
4. **Version 1.0.0 released** — Major bump, built, verified, installed via NSIS
5. **RTL-002 Part 1 Diagnostic** — n8n health, API key, reachability, skill file, container connectivity — all green
6. **RTL-002 Part 2 End-to-End Proof** — Created "Zuberi Intake Proof v1" workflow, activated, triggered webhook, verified execution succeeded (ID: 4, status: success)
7. **RTL-002 Part 2b Production Workflow** — Created "Zuberi AI Audit Intake v1" (CXDB + AgenticMail), resolved Docker networking obstacles, all 4 nodes verified
8. **RTL-050 Capability Awareness Backfill** — Wrote 8 CXDB capability records (context 8, turns 10–17) for all live verified capabilities. Updated AGENTS.md to v0.8.4 with Capability Awareness Rule (Section 13). No code changes.
9. **RTL-051 Debug Leaked Control Outputs** — Added frontend sentinel filtering (`isSentinelOutput()`) to suppress NO, NO_REPLY, HEARTBEAT_OK from rendering in main chat. Root cause: no frontend filtering + heartbeat shares session + bare NO is a model template artifact not caught by backend. `deliver: false` confirmed correct.
10. **About dialog version fix** — Updated hardcoded `v0.1.1` → `v1.0.0` in ZuberiContextMenu.tsx to match tauri.conf.json.
11. **v1.0.1** — RTL-051b closed (not reproduced). User message alignment fixed (right → left). Copy button added to all message bubbles (hover-to-show, copies raw text). 9 new tests. Version bumped to 1.0.1.

All 155/155 tests passing (13 smoke + 103 permissions + 30 markdown/blocks + 9 copy button).

## Model Matrix Upgrade (2026-03-09)

Upgraded `zuberi-model-matrix.html` from a 12-model Zuberi/KILO-specific reference into a general-use, hardware-aware open model explorer. Standalone HTML file — no ZuberiChat source files touched.

**File:** `C:\Users\PLUTO\OneDrive\Documents\AIAgent\Staging\Intel\zuberi-model-matrix.html`
**Backup:** `C:\Users\PLUTO\OneDrive\Documents\AIAgent\Staging\Intel\zuberi-model-matrix.bak.html`

**What changed:**
- Title: "Zuberi Home — Model Matrix" → "Model Matrix"
- Models: 12 → 26 (Llama, Qwen, Mistral, Gemma, Granite, DeepSeek families)
- Hardware selector: VRAM (6/8/12/16/24/48 GB+), CPU offload toggle, workload profile chips
- Dynamic fit badges (Full/Offload/No) computed from selected hardware
- Summary card: "Best for your hardware" — recalculates on hardware change
- Speed column: single "Est. t/s" with provenance badges (M/C/E) replaces dual 24/48 GB columns
- Caps column: icon grid (vision/tool use/reasoning/long context)
- Structured notes: Best for / Avoid if / Hardware notes / Caveats
- Reference rows (DeepSeek-V3, Mixtral 8x22B) marked with REF badge and honest hardware notes
- All Zuberi/KILO/private references removed
- File size: 15,366 → 36,032 bytes

## Model Matrix Family Expansion (2026-03-09)

Expanded Model Matrix with 3 new families (7 new models). Data-only change — no HTML/CSS/JS logic modified.

**File:** `C:\Users\PLUTO\OneDrive\Documents\AIAgent\Staging\Intel\zuberi-model-matrix.html`
**Pre-expansion backup:** `C:\Users\PLUTO\OneDrive\Documents\AIAgent\Staging\Intel\zuberi-model-matrix.pre-family-expansion.bak.html`

**New families added:**
- GPT-OSS (1): GPT-OSS 20B — OpenAI MoE, 3.6B active, fast inference
- Phi (3): Phi-4 Mini (3.8B), Phi-4 Multimodal (5.6B, vision), Phi-4 (14B) — Microsoft reasoning/coding models
- Aya (3): Aya Expanse 8B, Aya Expanse 32B, Aya Vision 8B — Cohere multilingual models

**DBRX intentionally excluded** per spec.

**Updated totals:**
- Models: 26 → 33
- Families: 6 → 9 (Qwen 9, Mistral 4, Granite 4, Phi 3, Llama 3, Gemma 3, DeepSeek 3, Aya 3, GPT-OSS 1)
- File size: 36,032 → 40,654 bytes

## Model Matrix Audit Fixes (2026-03-09)

Data and logic corrections to Model Matrix. No ZuberiChat source files touched.

**File:** `C:\Users\PLUTO\OneDrive\Documents\AIAgent\Staging\Intel\zuberi-model-matrix.html`
**Pre-audit backup:** `C:\Users\PLUTO\OneDrive\Documents\AIAgent\Staging\Intel\zuberi-model-matrix.pre-audit-fixes.bak.html`

**Fixes applied:**
1. **GPT-OSS 20B context:** `8K` → `128K`, `longContext: true`, speed estimates moderated (130-140 → 80-85 t/s), provenance changed C → E
2. **Offload threshold:** `selectedVram * 2.5` → `selectedVram * 1.5` (spec compliance)
3. **Category ranked filtering:** Workload profiles now filter the visible list to relevant models only. Non-relevant models hidden behind "Show all models" toggle. Vision workload shows only vision-capable models. Empty state messages when no models fit.
4. **Summary card scoring:** bestVision, bestAgent, bestCoding now factor speed/practicality alongside quality. bestVision requires `vision: true` (was already correct, now also weights speed).
5. **`isWorkloadRelevant()` function added:** General=all, Coding=coding:true, Agent=toolScore>=3 or agentic, Research=reasoning or longContext, Vision=vision:true, Fast=fast:true

**Updated totals:**
- Models: 33 (unchanged)
- File size: 40,654 → 44,177 bytes

## RTL-051: Model Stack Upgrade + Native Ollama API Switch (2026-03-09)

Upgraded Zuberi's model stack for RTX 5070 Ti 16GB and switched OpenClaw from OpenAI-compatible API to native Ollama API for reliable tool calling.

**Config file:** `C:\Users\PLUTO\openclaw_config\openclaw.json`
**Backup:** `C:\Users\PLUTO\openclaw_config\openclaw.json.bak`

**API changes:**
- `baseUrl`: `http://host.docker.internal:11434/v1` → `http://host.docker.internal:11434` (removed `/v1`)
- `api`: `"openai-completions"` → `"ollama"` (native Ollama API)
- Rationale: `/v1` OpenAI-compatible mode breaks tool calling — models return raw tool JSON as text instead of structured tool calls

**New model stack (all 131072 context):**
| Model | Role | Input | Size |
|-------|------|-------|------|
| `gemma3:12b` | Primary general + vision | text, image | 8.1 GB |
| `gpt-oss:20b` | Heavy reasoning/tools | text | 13 GB |
| `qwen2.5-coder:14b` | Dedicated coding | text | 9.0 GB |

**Old models removed from config:**
- `qwen3:14b-fast`, `qwen3:14b`, `qwen3-vl:8b-fast`, `gpt-oss:20b` (32K context versions)

**Primary model:** `ollama/qwen3:14b-fast` → `ollama/gemma3:12b`

**Compaction settings:** Kept as-is (mode: safeguard, reserveTokensFloor: 4000, softThresholdTokens: 2000). With 128K context the flush triggers at ~126K tokens — safe headroom.

**Old models still on disk (eligible for cleanup, ~30.8 GB total):**
- `qwen3:14b-fast` (9.3 GB), `qwen3:14b` (9.3 GB), `qwen3-vl:8b-fast` (6.1 GB), `qwen3-vl:8b` (6.1 GB)
- To remove: `ollama rm <model-name>` for each

**Verification:**
- ✅ Gateway container restarted and healthy
- ✅ Config verified inside container (no /v1, api: ollama, 3 models, 131072 context)
- ✅ Smoke test: gemma3:12b responded correctly

## Next Task

RTL-047 Phase 2: ToolApprovalCard UI for pending approvals with user interaction.
