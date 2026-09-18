# Infrastructure Contract

## 1. Current topology

Yubie Web can continue on its existing Vinext/Cloudflare-compatible runtime.

Stateful production workloads follow:

- `docs/development/33_VPS_DEPLOYMENT_ARCHITECTURE.md`
- `docs/production/vps/README.md`

Current business model is marketplace-first / WhatsApp-first. Do not introduce production payment-provider secrets while ADR-004 remains active.

## 2. Environments

~~~text
local
staging
production
~~~

Each environment uses separate database and provider credentials.

## 3. Target Core VPS

~~~text
Caddy
Yubie API
Yubie Worker
PostgreSQL
backup agent
optional telemetry collector
~~~

Only the reverse proxy publishes external application ports.

## 4. Sidecars

Chatwoot and CRM have separate runtime/database ownership. ERPNext is future/problem-triggered.

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

## 8. Network warning

Docker-published ports may bypass UFW assumptions. Publish only intended reverse-proxy ports, keep DB/Redis/internal APIs private, and verify externally after changes.
