# Observability and Debugging Guide

## Structured log tags
- `auth`: token acquisition and credential validity
- `token`: token refresh/cache behavior
- `ws`: websocket connect/disconnect lifecycle
- `webhook`: webhook server/challenge/event parsing
- `event_in`: inbound Feishu event receipt and dedup result
- `reply_out`: outbound message send/update results

## Health indicators
- Token probe success (`probeFeishu ok=true`)
- Bot identity resolved (`botName`, `botOpenId`)
- Current mode (`websocket`/`webhook`)
- Last event timestamp (from monitor/event logs)

## Diagnostics script
- Run `pnpm dev` (or `pnpm start` after build) to print:
  - redacted configuration
  - mode + domain
  - bot identity and token probe status
