# Feishu Integration Stack Map

## Architecture Classification
- **Type:** OpenClaw **channel plugin**, not a standalone service.
- **Host runtime:** Loaded by OpenClaw via `index.ts` + `openclaw.plugin.json`.
- **Primary role:** Receive Feishu/Lark events, normalize/route to OpenClaw agent runtime, send replies back through Feishu APIs.

## Runtime & Tooling
- **Language/runtime:** Node.js + TypeScript (`"type": "module"`, NodeNext).
- **Module system:** ESM.
- **Build/transpile tooling:** `tsc` (declarations + dist build), `tsx` for local scripts.
- **Package manager:** pnpm (lockfile present).
- **Core SDK:** `@larksuiteoapi/node-sdk`.

## Entrypoints
- `index.ts`: plugin registration (channel + tools).
- `src/channel.ts`: channel plugin implementation for OpenClaw.
- `src/monitor.ts`: account monitor lifecycle, WS/webhook setup, event dispatch.

## Configuration Sources
- Primary host config: OpenClaw channel config (`channels.feishu`), validated by `src/config-schema.ts`.
- Added env contract: `.env` / process env validated by `src/env-contract.ts` for deployment consistency.

## Key Config Contract (integration baseline)
- `FEISHU_DOMAIN`: `feishu` | `lark`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_VERIFICATION_TOKEN` (optional)
- `FEISHU_ENCRYPT_KEY` (optional)
- `FEISHU_MODE`: `websocket` | `webhook`
- `PORT` (required for webhook mode)
- `AGENT_ENDPOINT`

## Integration Surface
- **Inbound events:**
  - WebSocket: `WSClient.start(eventDispatcher)`
  - Webhook: HTTP server + Feishu challenge/event handler (default `/feishu/events`)
  - Main event: `im.message.receive_v1`
- **Outbound replies:**
  - Feishu message API wrappers (`src/send.ts`, `src/media.ts`, `src/outbound.ts`)
- **Agent handoff:**
  - Inside OpenClaw runtime dispatch path (`src/bot.ts`, `src/reply-dispatcher.ts`)

## Reliability Controls Already Present
- Message dedup by `message_id` (`src/dedup.ts`).
- Config schema validation (`src/config-schema.ts`).
- Probe utility to validate auth + bot identity (`src/probe.ts`).
