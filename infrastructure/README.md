# Infrastructure Contract

## 1. Current topology

Yubie Web can continue on its existing Vinext/Cloudflare-compatible runtime.

Stateful production workloads follow:

- `docs/development/33_VPS_DEPLOYMENT_ARCHITECTURE.md`
- `docs/production/vps/README.md`

Current business model: first-party checkout (ADR-012, Xendit TEST-first — marketplace links are the rollback/secondary channel) plus WhatsApp for assisted B2C/B2B. Xendit TEST-mode secrets belong in the api service env (staging.env contract); Xendit LIVE is prohibited until the ADR-012 sandbox matrix passes.

## 2. Environments

~~~text
local
staging
production
~~~

Each environment uses separate database and provider credentials.

## 3. Target Core VPS

~~~text
Caddy (only public TLS terminator)
Yubie API
Yubie Worker
Yubie Bot (Zammad webhook ingress)
PostgreSQL
migration job (runs before rollout)
backup agent
optional telemetry collector
~~~

Only the reverse proxy publishes external application ports.

## 4. Sidecars

Zammad (dedicated VPS per ADR-009) and CRM have separate runtime/database ownership; Chatwoot exists only as the rollback topology. ERPNext is future/problem-triggered.

Do not share application databases across Yubie, Chatwoot, CRM or ERP.

## 5. Secrets

Production secrets are supplied from the host/secret manager and never committed.

`api.env.example` is a non-secret configuration shape only.

## 6. Deployment

Target:

~~~text
GitHub Actions
 -> immutable GHCR images by commit SHA
 -> explicit migration
 -> Docker Compose rollout
 -> health/readiness
 -> synthetic checks
 -> observation hold
~~~

Do not build production from a mutable worktree.

## 7. Backups

Production PostgreSQL requires encrypted off-host backup and tested restore.

Once durable automation matters, use PITR-capable base-backup + WAL archival rather than relying on `pg_dump` or a VPS snapshot alone.

**M5-D scope (Yubie Postgres):** include `conversation_flow_state`, `conversation_flow_events`, `webhook_inbox`, `assistant_outbox`, `conversation_sessions`, and assistant run/audit tables required to resume deterministic flows.

**Zammad scope:** separate VPS backup via `infrastructure/zammad/scripts/backup.sh` — not covered by Yubie DB backup.

Restore drills run on isolated staging only; never destructive test on production.

## 8. Network warning

Docker-published ports may bypass UFW assumptions. Publish only intended reverse-proxy ports, keep DB/Redis/internal APIs private, and verify externally after changes.
