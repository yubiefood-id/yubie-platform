# 04 — API and Integration Contracts

## 1. API conventions

- Version public/partner routes (`/v1`).
- JSON UTF-8, stable field names, ISO-8601 UTC timestamps, integer money + currency.
- Resource IDs are opaque. Pagination uses stable cursors.
- Request and response schemas are owned in `packages/validation` and published with examples.
- Backward-compatible additions are allowed; removals/semantic changes require a version or migration window.

## 2. Error envelope

```json
{
  "error": {
    "code": "INVENTORY_UNAVAILABLE",
    "message": "The selected item is no longer available.",
    "requestId": "req_...",
    "details": []
  }
}
```

Public messages are safe and actionable. Internal logs carry root cause through request/trace ID without exposing secrets, SQL, stack traces, personal data, or provider credentials.

## 3. Idempotency

Every retryable mutation accepts an idempotency key scoped to authenticated principal/anonymous cart + operation. Persist key, canonical request hash, status, response reference and expiry. Same key + different payload is a conflict; same key + same payload returns the original committed outcome.

Required for checkout, payment-session creation, refund, inventory adjustment/reservation, fulfilment creation, B2B sample creation, and operator retry actions.

## 4. Authentication and authorization

- Public reads expose public projections only.
- Anonymous cart/checkout uses signed, scoped session identity and server-side validation.
- Operator APIs require strong authentication/MFA at the identity provider and role/permission checks at the resource action.
- Sensitive operator actions may require step-up or four-eyes approval.
- Service calls use short-lived workload identity or rotated scoped credentials.

## 5. Webhooks

For every provider: preserve exact raw request bytes required for signature verification; validate signature, timestamp and expected source metadata; reject stale or malformed events; insert provider event ID once; acknowledge after durable capture; process asynchronously; support duplicate and out-of-order delivery; reconcile missed events from provider APIs/reports.

Never use an unverified webhook field to mark an order paid, release inventory, issue a refund, or message a customer.

## 6. Provider adapter contract

Adapters normalize provider-specific states into Yubie domain states while retaining raw provider references. Every adapter defines timeouts, retry-safe operations, idempotency support, webhook signature method, rate limits, sandbox behavior, reconciliation endpoint/report, failure mapping, data location, support SLA, and exit/export path.

## 7. Contract testing

- Consumer/provider schema tests in CI.
- Recorded, redacted provider fixtures with version metadata.
- Sandbox smoke tests on a schedule and before provider-impacting release.
- Negative tests: invalid signature, replay, duplicate, late success, timeout, 429, 5xx, malformed payload, unknown state.
