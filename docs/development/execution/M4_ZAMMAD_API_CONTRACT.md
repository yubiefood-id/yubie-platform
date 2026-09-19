# M4-Z Zammad API Contract

**Verified against:** Zammad 7.1.x admin/API docs (2026-09-20)  
**Pinned image:** `ghcr.io/zammad/zammad:7.1.3-0014`

## Authentication

~~~http
Authorization: Token token={access_token}
~~~

- Create token for dedicated `yubie-bot-service` user (not super-admin).
- Required permissions: `ticket.agent` on bot-eligible groups.
- Separate staging/production tokens; never commit to Git.

## Webhook ingress (Yubie bot)

| Header | Purpose |
|--------|---------|
| `X-Zammad-Delivery` | Unique delivery ID for dedupe |
| `X-Zammad-Trigger` | Originating trigger name |
| `X-Hub-Signature` | HMAC-SHA1 of raw body (`sha1={hex}` or hex only) |
| `Authorization` | Optional `Bearer {token}` if configured in Zammad webhook |

**Not used:** Chatwoot-style timestamp replay header.

### Minimal custom payload (recommended)

~~~json
{
  "event": "article_created",
  "ticket_id": 123,
  "article_id": 456,
  "customer_id": 789,
  "group_id": 1,
  "state_id": 2
}
~~~

Yubie fetches article body via REST when processing (keeps webhook PII-minimal).

## Ticket read

~~~http
GET /api/v1/tickets/{id}
~~~

## Ticket articles (multi-turn context)

~~~http
GET /api/v1/ticket_articles/by_ticket/{ticket_id}
GET /api/v1/ticket_articles/{article_id}
~~~

Filter in Yubie: `internal=false`, `sender=Customer` for inbound bot trigger; exclude system noise.

## Outbound reply

~~~http
POST /api/v1/ticket_articles
Content-Type: application/json

{
  "ticket_id": 123,
  "body": "Reply text",
  "content_type": "text/plain",
  "type": "<discover for WhatsApp in staging>",
  "internal": false,
  "subject": "Reply",
  "to": ""
}
~~~

**Staging action required:** confirm WhatsApp `type` value from live channel.

## Handoff / routing

~~~http
PUT /api/v1/tickets/{id}
{
  "group_id": 2,
  "priority_id": 3,
  "yubie_bot_mode": "OFF"
}
~~~

~~~http
POST /api/v1/tags/add
{
  "object": "Ticket",
  "o_id": 123,
  "item": "123",
  "value": "human-required"
}
~~~

## Reconciliation search

~~~http
GET /api/v1/tickets/search?query=updated_at:>{iso}&sort_by=updated_at&order_by=asc
~~~

Use overlap window + checkpoint in `conversation_sync_checkpoints` (`provider=zammad`).

## Error mapping (Yubie)

| HTTP / error | Provider code |
|--------------|---------------|
| 401 | UNAUTHORIZED |
| 403 | FORBIDDEN |
| 404 | NOT_FOUND |
| 429 | RATE_LIMITED |
| 5xx | UNAVAILABLE |
| timeout after possible accept | AMBIGUOUS |

## Service account minimum scope

- Read tickets/articles in assigned groups
- Create public outbound articles
- Update ticket group/state/tags for handoff
- No system configuration permission
