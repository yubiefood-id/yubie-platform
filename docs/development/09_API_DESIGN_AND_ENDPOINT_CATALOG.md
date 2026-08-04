# 09 — API Design and Endpoint Catalog

## 1. Contract standards

- Base path `/v1`; JSON UTF-8; ISO-8601 UTC timestamps; integer money plus currency.
- Opaque resource IDs; stable cursor pagination; explicit filters/sort allowlist.
- Zod schemas in `packages/validation`; generate/publish OpenAPI from the same reviewed contract or verify drift in CI.
- Mutations return a stable resource/reference and never imply external delivery before it is known.
- Public error envelopes contain safe code, message, request ID and field/details; logs retain redacted cause.

```json
{
  "error": {
    "code": "INVENTORY_UNAVAILABLE",
    "message": "The selected item is no longer available.",
    "requestId": "req_opaque",
    "details": []
  }
}
```

## 2. Current endpoints

| Method/path | Status | Current behavior | Required evolution |
|---|---|---|---|
| `GET /health` | implemented | Process liveness response | Split liveness/readiness; dependency and version metadata safe for ops. |
| `GET /v1/products` | prototype | In-memory catalog projection | Published product projection, filtering, ETag/cache version and claim suppression. |
| `POST /v1/newsletter` | prototype | Validate and return `202` | Durable consent/subscription, dedupe, abuse control and delivery intent. |
| `POST /v1/b2b-leads` | prototype | Validate and return `202` | Durable lead, assignment/SLA, consent, audit and CRM outbox. |
| `POST /v1/checkout` | prototype | Create in-memory pending order | Quote reference, idempotency, reservation, durable order and payment-session response. |

## 3. Planned customer/public endpoints

| Method/path | Purpose | Auth/idempotency | Phase |
|---|---|---|---|
| `GET /v1/products` | Published catalog projection | public cacheable read | D1 |
| `GET /v1/products/{slug}` | Product/variant approved projection | public cacheable read | D1 |
| `POST /v1/waitlist/subscriptions` | Join product-specific waitlist | abuse control + idempotency | D1 |
| `POST /v1/waitlist/confirmations` | Confirm opaque subscription token | one-time token + idempotency | D1 |
| `DELETE /v1/waitlist/subscriptions/{token}` | Withdraw/suppress preference | opaque scoped token | D1 |
| `POST /v1/newsletter/subscriptions` | Marketing/community subscription | consent + idempotency | D1 |
| `POST /v1/b2b/leads` | Capture business enquiry | abuse control + idempotency | D1 |
| `POST /v1/cart-quotes` | Reprice/revalidate browser cart | anonymous signed session + idempotency | D3 |
| `POST /v1/checkouts` | Create order/reservations | session + idempotency key | D3 |
| `POST /v1/checkouts/{id}/payment-session` | Create/retrieve hosted payment session | session + idempotency key | D4 |
| `GET /v1/orders/{publicToken}` | Minimal customer order timeline | token/session scoped | D4/D5 |
| `POST /v1/orders/{publicToken}/support-requests` | Structured support/complaint intake | token/session + abuse control | D5 |

## 4. Planned provider endpoints

| Method/path | Rule |
|---|---|
| `POST /v1/webhooks/payments/{provider}` | Raw-body signature verification, timestamp/replay check, durable inbox before acknowledgement. |
| `POST /v1/webhooks/fulfilment/{provider}` | Verify source/signature, dedupe provider event, normalize asynchronously. |
| `POST /v1/webhooks/communications/{provider}` | Capture delivery/bounce/complaint and update suppression safely. |

Provider endpoints use adapter-owned schemas and never expose their payload as Yubie domain contracts.

## 5. Planned operator endpoints

Group under `/v1/ops/*` with strong authentication, resource authorization and audit:

- orders/search, timeline, cancellation and permitted refund request;
- payments/reconciliation exceptions and resolution;
- inventory/lots receipt, release, quarantine, adjustment and recall;
- fulfilment paid queue, allocation, pack, ship and exception;
- product specifications, evidence, claims, approvals and publications;
- B2B lead stages, activities, sample approval/shipment;
- privacy data requests and consent history;
- operator tasks and incident references.

High-risk actions require reason codes and may require step-up/four-eyes approval.

## 6. Idempotency protocol

Retryable mutations accept `Idempotency-Key`. Server scopes it to principal/session + operation, stores canonical request hash and committed response reference. Same key/same hash returns the original result; same key/different hash returns `409 IDEMPOTENCY_KEY_REUSED`. Keys expire only after the relevant business retry/dispute window.

## 7. HTTP behavior

| Condition | Status/code direction |
|---|---|
| Valid synchronous creation | `201` with resource/reference |
| Durable capture; async work pending | `202` with status/reference, not false delivery success |
| Invalid input | `400 VALIDATION_ERROR` |
| Missing/invalid identity | `401` |
| Identity lacks resource action | `403` |
| Missing resource | `404` without enumeration leakage |
| State/idempotency conflict | `409` |
| Rate limited | `429` + bounded retry guidance |
| Dependency unavailable before safe commit | `503 DEPENDENCY_UNAVAILABLE` |

## 8. Contract verification

Tests cover examples, response status/headers, schema parsing, auth, idempotency, concurrency, signature failure, replay, duplicate/out-of-order event, provider timeout/429/5xx and redaction. Backward-incompatible changes require versioning or a measured consumer migration window.
