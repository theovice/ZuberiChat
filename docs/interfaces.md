# Feishu ↔ Agent Interface Contract

## Normalized inbound DTO
```ts
interface FeishuInboundMessage {
  user_id: string;
  chat_id: string;
  chat_type: "p2p" | "group";
  text: string;
  mentions: Array<{ id: string; name?: string }>;
  message_id: string;
  timestamp: string;
}
```

## Agent call contract
### HTTP
- `POST /chat`
- Request: `FeishuInboundMessage`
- Response:
```json
{ "text": "..." }
```
or
```json
{ "card": { "schema": "feishu-card", "data": {} } }
```

### WebSocket (optional)
- Event stream can emit partial chunks; fallback to non-streaming final response.

## Idempotency / retry behavior
- Deduplicate by `message_id`.
- If duplicate detected, ignore silently or log with `event_in` tag.

## Reply routing rules
- DM: always allow reply when sender passes policy.
- Group: require mention by default unless group policy explicitly opens it.
- Preserve chat context by replying into original `chat_id`.

## Safe formatting
- Default safe mode: plain text.
- Use Feishu cards for markdown-heavy output and structured content.
- Sanitize mentions to avoid accidental mass-mention behavior.
