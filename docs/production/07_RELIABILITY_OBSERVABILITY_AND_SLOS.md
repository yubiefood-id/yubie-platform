# 07 — Reliability, Observability and SLOs

## 1. Service levels

Initial monthly targets, revisited after baseline:

| Journey | SLI | Target |
|---|---|---|
| Browse/catalog | successful non-5xx requests excluding invalid client requests | 99.9% |
| Checkout command | valid requests receiving a durable, unambiguous outcome | 99.95% |
| Payment webhook capture | valid signed events durably captured within 60s | 99.95% |
| Order confirmation | paid orders visible to customer/operator within 5 min | 99.9% |
| Operator lot lookup | affected-order query completes within defined incident window | 99.9% |

Define latency objectives (p50/p95/p99) per endpoint after representative tests; do not hide failures with average latency.

## 2. Telemetry

- Structured logs: timestamp, level, service/version/environment, request/trace ID, safe entity references, event code, outcome and duration.
- Metrics: request rate/error/latency, saturation, DB pool/query, queue age/depth, retry/dead-letter, webhook verification, checkout/payment conversion, reservation failures, reconciliation exceptions.
- Traces across web → API → DB/provider/worker with sampled success and retained errors.
- Business audit events are separate from diagnostic logs.

Follow current [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) for interoperable names. Redact personal data, addresses, tokens, headers, request bodies and provider secrets.

## 3. Alert policy

Alerts must be actionable, symptom-oriented and linked to a runbook. Page for customer/order/safety impact or imminent data loss; ticket for trends/capacity. Examples:

- checkout or webhook error-budget burn;
- payment success without order transition;
- outbox/queue oldest age over threshold;
- inventory negative balance/invariant violation;
- reconciliation exception spike;
- database unavailable, disk/connection exhaustion, backup failure;
- claim/lot publication invariant breach;
- suspected privacy/security/food-safety event.

## 4. Dependency resilience

Per provider: timeout budget, retry policy, circuit behavior, rate-limit handling, idempotency, degraded UX, reconciliation and escalation. Do not retry permanent validation/auth failures. Use jitter and bounded attempts. Avoid retry storms and synchronized jobs.

## 5. Degraded modes

- Catalog may serve a last-known approved public projection when editorial origin is unavailable.
- Checkout becomes unavailable rather than accepting ambiguous orders if canonical DB/inventory cannot commit.
- Payment provider outage preserves carts/orders and communicates retry status without claiming payment failure/success incorrectly.
- Email/CRM outage never rolls back paid order; outbox retries with operator visibility.

## 6. Recovery evidence

Quarterly backup restore, webhook replay, outbox recovery, provider outage, credential revocation and lot-recall lookup exercises. Track detection, containment, recovery, data integrity and follow-up actions.
