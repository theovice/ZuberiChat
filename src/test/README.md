# ZuberiChat Smoke Tests

## Rule
Run `pnpm test` BEFORE and AFTER every code change.
If any test fails after your changes, fix it before committing.

## Adding Tests
When adding a new component or feature, add a smoke test that
verifies it renders without crashing.

## Running
```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```

## What's Tested
- ClawdChatInterface — renders, input field, Send button, connection status
- ModelSelector — empty models, populated models, Clear GPU option
- GpuStatus — no model loaded, model with VRAM display
- KanbanPanel — renders without crashing, handles backend unavailable
- App mount — main interface mounts and unmounts cleanly
