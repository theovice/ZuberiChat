# E2E Verification Checklist

1. Validate config contract parses without errors (`APP_ID/SECRET/MODE/AGENT_ENDPOINT`).
2. Auth check passes (token acquisition succeeds).
3. Bot identity resolves (`bot_open_id` not unknown).
4. For websocket mode: connection established and remains healthy.
5. For webhook mode: challenge handshake succeeds at callback URL.
6. Send DM to bot: inbound event logged with `event_in`.
7. Agent receives normalized DTO and returns response payload.
8. Feishu reply sends successfully (`reply_out` success).
9. Group chat behavior: without @ mention ignored (if requireMention=true).
10. Group chat behavior: with @ mention, response is generated.

## Failure matrix
- `400/401` token errors → wrong app credentials or domain mismatch.
- No inbound events → wrong subscription mode, missing event type, unreachable callback.
- Reply send failure → missing `im:message:send_as_bot` scope or invalid `chat_id`.
