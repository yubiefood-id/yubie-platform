# API Boundary

**Current target:** marketplace routing + WhatsApp/CRM integration. Direct checkout is deferred.

## Target public/internal endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | /healthz | liveness |
| GET | /v1/products | approved product projection |
| GET | /v1/products/:slug/purchase-options | marketplace + WhatsApp options |
| GET | /go/:channel/:listingKey | allowlisted tracked redirect |
| GET | /go/whatsapp/:intentKey | tracked click-to-chat redirect |
| POST | /v1/b2b/enquiries | optional fallback structured lead |
| POST | /v1/webhooks/chatwoot | signed event capture |
| POST | /v1/internal/assistant/messages | internal bot boundary |
| POST | /v1/internal/marketplace/imports | operator import |

listingKey always resolves server-side; no arbitrary redirect URL is accepted.

First-party checkout (ADR-012) is implemented behind COMMERCE_PROVIDER=xendit
(fail-closed: DATABASE_URL + Xendit secrets + https APP_ORIGIN required;
INVENTORY_MODE=lots required in staging/production). POST /v1/checkouts takes
an Idempotency-Key, re-prices server-side, runs the TX1-draft -> provider
session -> TX2-attach saga with lot reservations, and returns an opaque
checkout token; GET /v1/checkouts/{token} is the PII-free public status view
(full views live behind /v1/account/orders). Webhooks land on
POST /v1/webhooks/xendit/payment-session and process inbox+state+audit+outbox
in one transaction. Xendit LIVE remains prohibited until the ADR-012 sandbox
matrix passes against real TEST credentials.
