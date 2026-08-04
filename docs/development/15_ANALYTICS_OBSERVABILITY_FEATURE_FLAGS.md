# 15 — Analytics, Observability and Feature Flags

## 1. Three measurement planes

| Plane | Answers | Authority |
|---|---|---|
| Product analytics | What behavior occurred in the experience? | Derived and consent-aware. |
| Business events | What canonical business transition committed? | Emitted from committed application state. |
| Runtime observability | Is the software healthy and why did it fail? | Diagnostic logs, metrics and traces. |

Do not calculate executive revenue solely from browser events. Reconcile business dashboards to verified payment/refund/settlement records.

## 2. Event catalog

| Event | Emission point | Allowed properties |
|---|---|---|
| `product_viewed` | rendered/visible product experience | product/variant ID, availability class, route, device class, consent state |
| `waitlist_submitted` | durable subscription commit | product ID, source class, result code; no email |
| `b2b_lead_submitted` | durable lead commit | business type, product interest, city region if approved; no contact/free text |
| `cart_item_added` | cart interaction | product/variant, quantity bucket |
| `cart_quoted` | authoritative quote | line count, result/difference codes, currency |
| `checkout_started` | durable checkout/order commit | order opaque ID, line count, amount bucket/currency |
| `payment_verified` | verified domain transition | provider/method class, amount/currency, result |
| `order_fulfilled` | fulfilment transition | lead-time bucket, carrier class |
| `refund_completed` | verified refund | reason class, amount/currency |

Every event has owner, purpose, schema version, trigger semantics, consent requirement, classification, retention, test and deprecation path.

## 3. Consent and resilience

Essential security/transaction logging is separated from optional behavior/marketing analytics. Evaluate consent before optional client collection. The site and checkout remain usable when analytics, tag manager or marketing provider is blocked/unavailable. Never send email, phone, address, raw URL query, free text, evidence or provider payload.

## 4. Observability conventions

- Propagate request/trace IDs across web, API, database spans, jobs and provider calls.
- Structured logs use event name, severity, safe resource IDs, result/error code and duration—not arbitrary object dumps.
- Metrics cover traffic, errors, latency, saturation plus business controls: checkout conflicts, duplicate prevention, reservation failures, webhook backlog, payment unknowns, reconciliation exceptions, lot blocks and communication failures.
- Traces sample enough error/slow/critical paths while respecting cost and privacy.
- Alerts map to user/business impact, owner, threshold/window and runbook.

## 5. Initial SLI/SLO implementation targets

| Journey | SLI | Initial target direction |
|---|---|---|
| Public browse | successful server responses and latency | ≥99.9% monthly, route latency budget defined per runtime |
| Checkout commit | valid requests yielding durable unambiguous result | ≥99.9% excluding customer validation failures |
| Webhook capture | valid signed events durably captured | ≥99.95% |
| Payment transition | verified event to local state | 99% within 5 minutes, subject to provider behavior |
| Outbox delivery | due critical events delivered/owned exception | 99% within 5 minutes |
| Operator lookup | critical order/lot search success | ≥99.9% during operating window |

Targets require business/SRE approval and baseline review before they become contractual.

## 6. Feature flags

Use flags for progressive exposure, provider adapter activation and reversible behavior—not to bypass migrations, product truth, authorization, food-safety or required disclosures.

Each flag has owner, purpose, default, environment, eligible cohort, metrics/abort signals, expiry date and removal task. Server evaluates critical flags; client flags only adjust presentation. A payment/fulfilment flag-off path must define what happens to in-flight orders.

## 7. Dashboards

- Executive: qualified discovery → verified payment → fulfilment → repeat, with reconciliation status.
- Commerce: checkout errors, attempts, provider state, refunds and settlement exceptions.
- Food operations: released/quarantined/expiring lots, reservation/oversell and recall completeness.
- Demand capture: waitlist per product/source and B2B pipeline aging/sample conversion.
- Reliability: SLO/error budget, deployment markers, queue/backlog, database/provider health and alert ownership.

Metric definitions specify timezone (`Asia/Jakarta` for business reporting), exclusions, late data, bot/internal traffic and revision history.
