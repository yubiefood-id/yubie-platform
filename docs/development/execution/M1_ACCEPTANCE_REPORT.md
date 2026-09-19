# M1 Acceptance Report

**Baseline SHA:** `6dfd4b4044f07fd2ee0d6b6af85513948661e7fb`  
**Implementation SHA:** uncommitted working tree (post-M0/M1 implementation)  
**Date:** 2026-09-19  
**Verdict:** **CONDITIONAL GO**

## Executive summary

M0 commerce contradictions are closed and M1 marketplace routing foundation is implemented as a production-quality vertical slice. Core gates pass locally (`npm ci`, `npm run check`, `npm run build`, Postgres migrate/seed/integration). Production marketplace URLs and official WhatsApp destinations remain operator-supplied external blockers.

## Architecture implemented

```
apps/web → /api/purchase-options proxy → apps/api
apps/api → packages/application → packages/domain
packages/persistence (PostgreSQL) implements repository ports
packages/integrations implements allowlist + link health checker
apps/worker (pg-boss) runs listing.health + integration.health jobs
```

D1 (`apps/web/db`) remains empty and non-canonical.

## Packages added

| Package / App | Purpose |
|---------------|---------|
| `packages/application` | Use cases + ports + in-memory fakes |
| `packages/persistence` | Drizzle schema, migrations, Postgres repos |
| `packages/integrations` | Redirect allowlist, HTTP link health checker |
| `apps/worker` | pg-boss worker foundation |

## Database migrations

- `packages/persistence/migrations/0001_initial.sql`
- Tables: `marketplace_listings`, `outbound_clicks`, `whatsapp_intents`, `idempotency_keys`, `outbox_events`, `audit_events`, `operator_tasks`, `integration_health`

**Local verification:**
```bash
npm run infra:up
DATABASE_URL=postgresql://yubie:yubie_local@127.0.0.1:5432/yubie_dev npm run db:migrate
DATABASE_URL=postgresql://yubie:yubie_local@127.0.0.1:5432/yubie_dev npm run db:seed
DATABASE_URL=postgresql://yubie:yubie_local@127.0.0.1:5432/yubie_dev npm run test --workspace @yubie/persistence
```
Result: migration applied, seed complete, 2/2 persistence tests pass.

## API endpoints

| Endpoint | Status |
|----------|--------|
| `GET /healthz` | Implemented |
| `GET /readyz` | Implemented |
| `GET /v1/products/:slug/purchase-options` | Implemented |
| `GET /go/:channel/:listingKey` | Implemented (fail-closed) |
| `GET /go/whatsapp/:intentKey` | Implemented (503 when unconfigured) |

Static mode (`PURCHASE_OPTIONS_SOURCE=static` or no `DATABASE_URL`) provides one synthetic ACTIVE Shopee fixture for local dev only.

## M0 frontend closeout

| Item | Status |
|------|--------|
| Cart removed from layout/header | Done |
| Add to Cart / Quick add removed | Done |
| `/cart`, `/checkout` redirect away | Done |
| `PurchaseOptions` component wired to API | Done |
| B2B intent types (sample/bulk/product-dev) | Done |
| Analytics: `marketplace_click`, `whatsapp_intent_click` | Done |
| Orphan cart files removed | Done |

## Test results

```text
npm run check  → PASS (lint + typecheck + all workspace tests)
npm run build  → PASS

Test counts (node --test):
- domain: 7
- validation: 2
- integrations: 2
- application: 4
- persistence: 2 (1 skipped without DATABASE_URL in default check; 2/2 with DATABASE_URL)
- commerce: existing
- api: 11
- worker: 1
- web rendered-html: 7
```

### Security-relevant API tests (pass)

- Active redirect to allowlisted host
- Paused listing rejected (404)
- Invalid channel rejected (400)
- Open redirect query pattern unsupported (404)
- WhatsApp unconfigured returns 503

## Browser QA

Automated SSR smoke tests cover:
- No `Add to Cart` / `Quick add` / `Lanjut ke Checkout` on flour PDP
- `/cart` and `/checkout` no longer production commerce pages
- Marketplace-first copy on shop page
- B2B offering language preserved

Manual browser QA with gstack browse recommended before production deploy.

## Security review

| Check | Result |
|-------|--------|
| Open redirect via caller URL | Blocked (no `?url=` handler) |
| Destination host allowlist | Enforced in application layer |
| PII in outbound clicks | Not stored (source/campaign/placement only, allowlisted) |
| Secrets in repository | None committed |
| Preview checkout | Gated; not in production web paths |

## Production readiness

| Artifact | Status |
|----------|--------|
| `infrastructure/docker-compose.yml` | Done |
| `infrastructure/docker/Dockerfile.api` | Done |
| `infrastructure/docker/Dockerfile.worker` | Done |
| `infrastructure/docker-compose.prod.yml` | Example contract |
| CI Postgres job | Done (`.github/workflows/ci.yml`) |
| Root scripts (`infra:up`, `db:*`, `dev:worker`) | Done |

Not executed: VPS deploy, GHCR push, production backup drill.

## External blockers

1. **Real Shopee/Tokopedia ACTIVE listing URLs** — seed contains DRAFT/PAUSED only; operators must verify and activate listings.
2. **Official WhatsApp destination** — `/go/whatsapp/*` returns 503 until configured.
3. **VPS credentials** — deploy not performed.

## Rollback

- Set `PURCHASE_OPTIONS_SOURCE=static` for emergency fallback to in-memory fixture.
- App image rollback only with schema-compatible migrations (forward-only migration policy).

## GO gate checklist

| Gate | Met? |
|------|------|
| No first-party checkout UX | Yes |
| PostgreSQL canonical for M1 | Yes |
| Application/persistence boundaries | Yes |
| Safe redirect endpoints | Yes |
| Worker foundation | Yes (code; not long-run soak tested) |
| Local dev without provider creds | Yes |
| CI with Postgres | Yes |
| `npm run check` / `build` | Yes |
| Real marketplace URLs live | **No** (external) |
| WhatsApp configured | **No** (external) |

## Verdict rationale

**CONDITIONAL GO** — engineering gates are met; commercial activation requires operator-verified marketplace listings and WhatsApp configuration before customer-facing GO in production.
