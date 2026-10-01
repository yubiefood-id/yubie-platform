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
| Routing | `ZAMMAD_GROUP_*`, `ZAMMAD_PRIORITY_HIGH` |

Provision groups/tags/custom fields:

~~~bash
npm run zammad:provision -- --dry-run
npm run zammad:provision
~~~

### Configuration contract (fail-closed)

Validated at startup by `packages/config` (`@yubie/config`). Unknown
`SUPPORT_PROVIDER`/`BOT_ENGINE` values and missing required staging/production
variables stop the service with `CONFIG_ERROR` before traffic is accepted —
there is **no silent fallback** to `FakeZammadClient`, fixture routing IDs, or
a guessed WhatsApp article type. `YUBIE_ENV` selects the tier: `fake` providers
and fixture IDs are allowed only in `development`/`test`.

| Variable | Dev | Staging | Production | Source / classification |
|----------|-----|---------|------------|------------------------|
| `SUPPORT_PROVIDER` | yes | yes (`zammad`) | yes (`zammad`) | operator — STATIC |
| `BOT_ENGINE` | yes | yes (`deterministic`) | yes (`deterministic`) | operator — STATIC |
| `YUBIE_ENV` | yes | yes (`staging`) | yes (`production`) | operator — STATIC |
| `ZAMMAD_BASE_URL` | when `zammad` | yes | yes | deployment — STATIC |
| `ZAMMAD_API_TOKEN` | when `zammad` | yes | yes | Zammad service account — GENERATED, SECRET |
| `ZAMMAD_WEBHOOK_SECRET` | optional local | at least one of secret/bearer (both recommended) | at least one (both recommended) | operator — GENERATED, SECRET |
| `ZAMMAD_WEBHOOK_BEARER` | optional local | at least one of secret/bearer | at least one (both recommended) | operator — GENERATED, SECRET |
| `ZAMMAD_GROUP_BOT_QUEUE` | fixture allowed | yes | yes | DISCOVERED_FROM_ZAMMAD |
| `ZAMMAD_GROUP_CUSTOMER_SUPPORT` | fixture allowed | yes | yes | DISCOVERED_FROM_ZAMMAD |
| `ZAMMAD_GROUP_SALES_PARTNERSHIP` | fixture allowed | yes | yes | DISCOVERED_FROM_ZAMMAD |
| `ZAMMAD_GROUP_FOOD_SAFETY` | fixture allowed | yes | yes | DISCOVERED_FROM_ZAMMAD |
| `ZAMMAD_PRIORITY_HIGH` | fixture allowed | yes | yes | DISCOVERED_FROM_ZAMMAD |
| `ZAMMAD_WHATSAPP_ARTICLE_TYPE` | local default (`whatsapp`) allowed | yes | yes | DISCOVERED_FROM_ZAMMAD |

Rules:

- "Fixture allowed" means development/test may omit the variable and the
  documented fixture IDs (`1`–`4`) apply locally. Fixture/placeholder values
  must **never** be used as staging/production values; a real installation
  whose IDs genuinely are 1–4 simply sets them explicitly.
- The article type and all routing IDs are discovered from the real staging
  Zammad instance (`npm run zammad:provision` prints them); they are not
  guessed defaults in staging/production.
- Validate any environment shell without contacting Zammad:

~~~bash
npm run config:validate
~~~

## Backups

Zammad state is **not** covered by Yubie Postgres backups. Use:

- `scripts/backup.sh` — Zammad Postgres + storage snapshot
- `scripts/restore-test.sh` — quarterly restore validation

## Rollback

Keep Chatwoot infrastructure and `SUPPORT_PROVIDER=chatwoot` available during the migration window. See `docs/production/runbooks/zammad-rollback.md`.
