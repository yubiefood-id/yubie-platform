# Zammad (self-hosted support platform)

Yubie runs Zammad on a **dedicated VPS**, separate from the core API/worker/bot stack.

## Topology

~~~text
Dedicated Zammad VPS
  Zammad app (Rails + nginx + workers)
  PostgreSQL (Zammad-owned)
  Redis
  Memcached
  Elasticsearch
  persistent storage + backups

Core Yubie VPS
  apps/bot  -> POST /webhooks/zammad
  apps/worker -> Zammad REST API (outbound articles, handoff)
  packages/assistant (unchanged)
~~~

Only the Zammad HTTPS frontend is public. PostgreSQL, Redis, Memcached, and Elasticsearch must not be internet-public.

## Pin versions

See [`zammad.lock.json`](./zammad.lock.json). Never use `:latest` in production.

## Bootstrap (staging)

~~~bash
# On Zammad VPS
sudo sysctl -w vm.max_map_count=262144
git clone https://github.com/zammad/zammad-docker-compose.git /opt/zammad
cd /opt/zammad
cp /path/to/yubie/infrastructure/zammad/.env.example .env
# Edit .env: VERSION, FQDN, TLS email

docker compose \
  -f docker-compose.yml \
  -f /path/to/yubie/infrastructure/zammad/docker-compose.yubie.override.yml \
  up -d

./infrastructure/zammad/scripts/verify.sh
~~~

DNS: `support-staging.yubie.id` (staging), `support.yubie.id` (production later).

## Yubie integration

| Component | Env |
|-----------|-----|
| Provider selector | `SUPPORT_PROVIDER=zammad` |
| API | `ZAMMAD_BASE_URL`, `ZAMMAD_API_TOKEN` |
| Webhook | `ZAMMAD_WEBHOOK_SECRET`, `ZAMMAD_WEBHOOK_BEARER` |
| WhatsApp article type | `ZAMMAD_WHATSAPP_ARTICLE_TYPE` (discover in staging) |

Provision groups/tags/custom fields:

~~~bash
npm run zammad:provision -- --dry-run
npm run zammad:provision
~~~

## Backups

Zammad state is **not** covered by Yubie Postgres backups. Use:

- `scripts/backup.sh` — Zammad Postgres + storage snapshot
- `scripts/restore-test.sh` — quarterly restore validation

## Rollback

Keep Chatwoot infrastructure and `SUPPORT_PROVIDER=chatwoot` available during the migration window. See `docs/production/runbooks/zammad-rollback.md`.
