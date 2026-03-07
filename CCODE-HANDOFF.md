# ZuberiChat — ccode Handoff

**Updated:** 2026-03-06
**Repo:** C:\Users\PLUTO\github\Repo\ZuberiChat
**Installed version:** 0.1.1
**Repo version:** 0.1.1
**Smoke tests:** 13/13 (run `pnpm test` to verify)

## Current Sidebar State

Items (in order):
1. **New chat** — icon: SquarePen, event: `emit('new-conversation')`
2. **Settings** — icon: Settings, event: `emit('open-settings')`
3. *(spacer)*
4. **Kanban Board** — icon: LayoutGrid, action: `invoke('open_url_in_browser', { url: 'http://100.100.101.1:3001' })`

About Zuberi location: `ZuberiContextMenu.tsx` (right-click menu → Help → About Zuberi), NOT in the sidebar
About Zuberi text: `Zuberi v0.1.1\nWahwearro Holdings LLC`

## Known Architecture Facts

- Tauri v2: `security.csp` lives inside `app` object (`app.security.csp`), NOT at root level
- CSP must include: `connect-src 'self' http://localhost:11434 ws://127.0.0.1:18789`
- Model selector auto-refresh gated on `handshakeComplete` (line 418 of ClawdChatInterface.tsx) — expected, not a bug
- Clicking model selector dropdown bypasses gate via `onOpen` → `fetchModels()` and fetches from Ollama directly
- Model selector button `disabled` condition is `isLoading` only — do NOT re-add `models.length === 0` (causes chicken-and-egg)
- `fetchModels()` calls `http://localhost:11434/api/tags` — plain GET, no headers
- `sandbox.docker.network` must stay `"none"` — `"host"` crashes compose stack
- Never start ccode sessions by assuming installed app matches repo — always check git log
- Dev mode (`pnpm tauri dev`) has no CSP. Production build enforces Tauri v2 default CSP
- Single-instance guard: `tauri-plugin-single-instance` v2.4.0
- Capabilities file: `src-tauri/capabilities/default.json` — do NOT add `updater:default` or `http:` scopes here
- Cargo.toml version is `0.1.0` (Cargo-level), tauri.conf.json version is `0.1.1` (app-level) — Tauri uses tauri.conf.json

## Key File Locations

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | App version, CSP, window config, bundle config |
| `src-tauri/Cargo.toml` | Rust deps: tauri 2, serde, single-instance, process, opener |
| `src-tauri/capabilities/default.json` | Tauri v2 permissions (core, window, process, opener) |
| `src/components/layout/Sidebar.tsx` | 3 items: New chat, Settings, Kanban Board |
| `src/components/layout/Titlebar.tsx` | Window controls, sidebar toggle, UsageMeter, keyboard shortcuts |
| `src/components/layout/ZuberiContextMenu.tsx` | Right-click menu: File, Kanban, Edit, View, Help (About Zuberi) |
| `src/components/chat/ModelSelector.tsx` | Dropdown model picker, fetches from Ollama, preloads to GPU |
| `src/components/chat/ClawdChatInterface.tsx` | Main chat component, WebSocket to OpenClaw, fetchModels, drag-drop |
| `src/App.tsx` | Root component, sidebar state, Titlebar + Sidebar + ClawdChatInterface |
| `src/test/smoke.test.tsx` | 13 smoke tests |
| `package.json` | Version 0.1.1, key deps: tauri-apps/api, react 19, vite 6, vitest 4 |

## Last 5 Commits

```
8f18317 Remove GitHub Actions and Tauri updater — fully local build
1fffbf1 Bump version to 0.1.1
4ce5c06 Rewrite release workflow with manual build steps for debuggability
f9ba4b3 Fix release workflow: hardcode empty signing key password
e833d2b Fix sidebar cleanup, full-area drag-drop overlay, and model selector
```

## Uncommitted Changes

- `src-tauri/tauri.conf.json` — added `app.security.csp` (RTL-035: CSP fix for production build)
- `src/components/layout/ZuberiContextMenu.tsx` — About Zuberi text updated to `Zuberi v0.1.1\nWahwearro Holdings LLC`

## Do Not Touch

- **GitHub Actions:** deleted entirely (commit `8f18317`) — do not recreate
- **Tauri updater:** stripped (commit `8f18317`) — do not re-add `tauri-plugin-updater`, `useUpdater.ts`, or `updater:default` capability
- **src-tauri/capabilities/default.json:** do not add `http:` scope here; CSP is in `app.security.csp`
- **Model selector disabled condition:** do not add `models.length === 0` — causes chicken-and-egg bug

## Pre-flight Checklist (run before any task)

1. `pnpm test` — must be 13/13
2. Kill any running `pnpm tauri dev` process
3. Read this file
4. Check `git log --oneline -3` to confirm repo state
5. Check `git status` for uncommitted changes

## Last Task Completed

RTL-035: Added `app.security.csp` to `tauri.conf.json` — fixes model selector in
production build. `connect-src` allows `http://localhost:11434` and `ws://127.0.0.1:18789`.
Built and installed successfully. 13/13 tests passing.

## Next Task

RTL-034: Local version poller — poll `version.json` in repo, show amber dot in
titlebar + version indicator in sidebar when installed version < repo version.
James clicks to authorize rebuild and relaunch.
