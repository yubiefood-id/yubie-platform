# M1 Release Reconciliation

**Date:** 2026-09-19  
**Baseline SHA:** `6dfd4b4044f07fd2ee0d6b6af85513948661e7fb`  
**Branch:** `main`  
**Local vs origin/main:** Same SHA; dirty worktree with uncommitted M0/M1 implementation

## Git state

```text
HEAD:     6dfd4b4044f07fd2ee0d6b6af85513948661e7fb
origin/main: 6dfd4b4044f07fd2ee0d6b6af85513948661e7fb
Status:   dirty (M0/M1 not yet committed at reconciliation start)
```

### Modified files (24)

- CI, package.json, package-lock.json
- apps/api (composition, middleware, routes, tests)
- apps/web (cart removal, purchase-options, B2B, analytics, tests)
- packages/domain, packages/validation

### Untracked additions

| Path | Purpose |
|------|---------|
| `packages/application` | Use cases + ports |
| `packages/persistence` | Drizzle schema, migrations, Postgres repos |
| `packages/integrations` | Redirect allowlist, link health |
| `apps/worker` | pg-boss worker |
| `infrastructure/` | Docker compose, Dockerfiles |
| `docs/development/execution/` | M0/M1 plans and acceptance |

### Excluded from commit

- `.cursor/` (local IDE config)

## File inventory vs M1 plan

| Deliverable | Status |
|-------------|--------|
| Marketplace-first frontend | Done |
| `GET /v1/products/:slug/purchase-options` | Done |
| `GET /go/:channel/:listingKey` | Done |
| `GET /go/whatsapp/:intentKey` | Done |
| Postgres migrations + seed | Done |
| Worker (listing.health) | Done |
| Docker artifacts | Done |
| CI Postgres job | Done |
| Audit/outbox Postgres adapters | Done (reconciliation) |

## External blockers (unchanged)

- Operator-verified ACTIVE Shopee/Tokopedia listing URLs in production DB
- Official WhatsApp intent destinations configured
- VPS production deploy and backup drill

## Gate verification

Run after reconciliation:

```bash
npm ci
npm run check
npm run build
npm run infra:up
DATABASE_URL=postgresql://yubie:yubie_local@127.0.0.1:5432/yubie_dev npm run db:migrate
DATABASE_URL=postgresql://yubie:yubie_local@127.0.0.1:5432/yubie_dev npm run db:seed
```

## Verdict

**M1 engineering slice ready to commit.** Commercial production GO remains conditional on operator-supplied marketplace URLs and WhatsApp configuration per M1_ACCEPTANCE_REPORT.md.
