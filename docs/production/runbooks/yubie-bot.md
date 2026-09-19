# Yubie Bot Runbook

## Service

- App: `apps/bot`
- Port: 8788
- Endpoint: `POST /webhooks/chatwoot-agentbot`

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Yubie Postgres |
| `CHATWOOT_AGENTBOT_SECRET` | Webhook HMAC secret |
| `ASSISTANT_AUTO_REPLY` | Global kill switch (`false` default) |
| `ASSISTANT_MODE` | `shadow` / `suggestion` / `auto` |
| `MODEL_PROVIDER` | `fake` or `vllm` |
| `CHAT_PROVIDER` | `fake` or `chatwoot` |

## Health

- `GET /healthz` — liveness
- `GET /readyz` — database configured
- `GET /metrics` — webhook counters

## Failure behavior

- Invalid signature → 401, increment `bot_webhook_rejected_total`
- Duplicate → 200, increment `bot_webhook_duplicate_total`
- DB unavailable → 503; Chatwoot retries; humans unaffected

## Rollback

Set `ASSISTANT_AUTO_REPLY=false`. Scale bot to zero; Chatwoot human agents continue.
