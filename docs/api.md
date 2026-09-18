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

POST /v1/checkouts remains preview/legacy until a future first-party-commerce ADR. Do not attach production payment credentials.
