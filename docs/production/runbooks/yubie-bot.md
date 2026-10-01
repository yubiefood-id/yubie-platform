# Yubie Bot Runbook

## Service

- App: `apps/bot`
- Port: 8788
- Endpoint: `POST /webhooks/chatwoot-agentbot`

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Yubie Postgres |
| `YUBIE_ENV` | `development` / `test` / `staging` / `production` (validated fail-closed) |
| `CHATWOOT_AGENTBOT_SECRET` | Webhook HMAC secret |
| `ASSISTANT_AUTO_REPLY` | Global kill switch (`false` default) |
| `ASSISTANT_MODE` | `shadow` / `suggestion` / `auto` |
| `MODEL_PROVIDER` | `fake` or `vllm` |
| `CHAT_PROVIDER` | `fake` or `chatwoot` (legacy alias; `SUPPORT_PROVIDER` wins) |
| `SUPPORT_PROVIDER` | `fake`, `chatwoot`, or `zammad` — unknown values stop startup |
| `BOT_ENGINE` | `deterministic` (default) or `legacy` — unknown values stop startup |
| `ZAMMAD_*` | Required when `SUPPORT_PROVIDER=zammad` — see table in `infrastructure/zammad/README.md` |

Configuration is validated at startup by `@yubie/config` (`packages/config`):
invalid provider/engine values or missing required staging/production Zammad
variables stop the service with `CONFIG_ERROR` diagnostics that name variables
only (never secret values). Validate a staging shell without any network via:

~~~bash
npm run config:validate
~~~

Zammad webhook: `POST /webhooks/zammad`

## Health

- `GET /healthz` — liveness
- `GET /readyz` — database configured AND runtime configuration valid
- `GET /metrics` — webhook counters

## Failure behavior

- Invalid signature → 401, increment `bot_webhook_rejected_total`
- Duplicate → 200, increment `bot_webhook_duplicate_total`
- DB unavailable → 503; Chatwoot retries; humans unaffected

## Rollback

1. **Emergency OFF (no rebuild):** `POST /ops/assistant/emergency-off` with `Authorization: Bearer $OPS_API_TOKEN`
2. **Human-first:** disable automation; route to human operators
3. `BOT_ENGINE=legacy` + `ASSISTANT_MODE=shadow` — never uncontrolled generative production
4. Set `ASSISTANT_AUTO_REPLY=false` and restart worker
5. Scale bot to zero if needed; human agents continue in Zammad

Migration 0005 is additive; do not DROP flow tables during rollback.

## M5-D deterministic pipeline

Bot: verify → `webhook_inbox` → `assistant.process`  
Worker: `ConversationEngineRouter` → `conversation_flow_state` → `assistant_outbox` → `support.reply`  
Scheduled: `support.reconcile`, `webhook.cleanup`
