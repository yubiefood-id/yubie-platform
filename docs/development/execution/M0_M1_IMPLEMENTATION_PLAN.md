# M0 + M1 Implementation Plan (Contract Freeze)

**Baseline SHA:** `6dfd4b4044f07fd2ee0d6b6af85513948661e7fb`  
**Status:** Frozen for implementation  
**Scope:** M0 commerce closeout + M1 marketplace routing vertical slice

## Non-goals

- M2 Chatwoot, M3 assistant, M4 CRM, M5 marketplace APIs, M7 ERP, M8 direct commerce
- Real Shopee/Tokopedia URLs without operator verification
- Production VPS deploy without credentials

## Package graph

```
apps/web → apps/api → packages/application → packages/domain
apps/worker → packages/application
packages/persistence → packages/application (implements ports)
packages/integrations → packages/application (implements policies/checkers)
```

## Domain contracts (`packages/domain/src/channel.ts`)

- `Marketplace`: `shopee` | `tokopedia`
- `ListingStatus`: `draft` | `active` | `paused` | `broken` | `retired`
- `MarketplaceListing`, `WhatsAppIntent`, `OutboundIntent`, `AttributionContext`
- `PurchaseOption` (marketplace | whatsapp), `ProductPurchaseOptions`
- `ListingHealthResult`, `ListingHealthCheck`
- `Result<T>`, `ErrorCode`

## Application ports

| Port | Methods |
|------|---------|
| `MarketplaceListingRepository` | `findByKey`, `findActiveByProduct`, `save`, `listAll` |
| `WhatsAppIntentRepository` | `findByKey`, `findActiveByProduct` |
| `OutboundIntentRepository` | `append` |
| `ListingHealthRepository` | `record`, `latestForListing` |
| `AuditRepository` | `append` |
| `OperatorTaskRepository` | `create` |
| `OutboxRepository` | `enqueue` |
| `RedirectAllowlistPolicy` | `isAllowedUrl`, `isAllowedHost` |
| `AttributionPolicy` | `sanitize` |
| `Clock` | `now` |
| `IdGenerator` | `nextId` |

## Use cases

1. `GetPurchaseOptions(slug)` — domain product + ACTIVE listings only
2. `ResolveMarketplaceRedirect(channel, listingKey, attribution)` — fail-closed validation; record intent with 200ms timeout
3. `ResolveWhatsAppRedirect(intentKey, attribution)` — 503 if unconfigured
4. `CheckListingHealth(listingKey)` — conservative HTTP check

## API endpoints

| Route | Response |
|-------|----------|
| `GET /healthz` | `{ ok, service, version, releaseSha? }` |
| `GET /readyz` | 200 if Postgres reachable, else 503 |
| `GET /v1/products/:slug/purchase-options` | `{ data: ProductPurchaseOptions }` |
| `GET /go/:channel/:listingKey` | 302 to server-owned URL |
| `GET /go/whatsapp/:intentKey` | 302 or 503 |

Redirect policy: listing validation failure → no redirect. Analytics failure after safe resolution → log + still redirect.

## Database (M1 minimum)

Tables: `marketplace_listings`, `outbound_clicks`, `whatsapp_intents`, `idempotency_keys`, `outbox_events`, `audit_events`, `operator_tasks`, `integration_health`

Constraints:
- `UNIQUE(marketplace, listing_key)`
- `UNIQUE(marketplace, external_listing_id)` WHERE NOT NULL
- Status enum checks
- HTTPS-only ACTIVE URLs with allowlisted hosts

## Seed policy

Synthetic DRAFT/PAUSED only. No fake ACTIVE production marketplace URLs.

## Worktree ownership

| Agent | Paths |
|-------|-------|
| frontend-m0 | `apps/web/**` |
| persistence | `packages/persistence/**`, `infrastructure/docker-compose.yml` |
| application-api | `packages/application/**`, `packages/domain/**`, `apps/api/**` |
| worker-infra | `apps/worker/**`, `packages/integrations/**`, Dockerfiles, CI |
| controller | root `package.json`, merge, acceptance report |

## Rollback

- Feature flag `PURCHASE_OPTIONS_SOURCE=static|database`
- Schema-compatible app image rollback only; migrations are forward-only

## Acceptance gates

See `M1_ACCEPTANCE_REPORT.md` after implementation.
