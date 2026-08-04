# API boundary

Base path: `/v1`. All bodies use JSON. The current service is stateless and provider-neutral.

| Method | Route | Purpose | Current behavior |
| --- | --- | --- | --- |
| `GET` | `/healthz` | Liveness | Returns service/version status |
| `GET` | `/v1/catalog` | Public catalog | Returns Flour, Shake, and Ppang states |
| `POST` | `/v1/newsletter` | Consent-based signup | Validates and acknowledges only |
| `POST` | `/v1/b2b-leads` | Wholesale inquiry | Validates and acknowledges only |
| `POST` | `/v1/checkouts` | Checkout orchestration | Returns a non-payable preview session |

## Error model

Errors are JSON objects with `ok: false` and a stable uppercase `code`. Invalid external input returns `400`; unavailable catalog lines return `409`; unknown routes return `404`.

## Production hardening sequence

1. Add request IDs, structured logs, and rate limits.
2. Persist consent and leads with retention metadata.
3. Integrate an Indonesian payment provider behind `CommerceProvider`.
4. Require idempotency keys for checkout creation.
5. Verify signed webhooks before any order transition.
6. Add inventory reservation and fulfillment reconciliation.
