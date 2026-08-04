# 15 — Capacity, Cost and Vendor Governance

## 1. Capacity model

Maintain forecast and measured baseline for sessions, product views, checkout starts, payment webhooks, orders/day, concurrent reservations, emails, B2B submissions, evidence files and operator users.

Before launch, verify at least 10× expected ordinary peak for read traffic and a documented conservative multiple for checkout/webhook traffic, bounded by realistic DB/provider limits. Record p95/p99 latency, error rate, connection saturation, queue age, cache hit rate and cost per successful order. Rebaseline after campaigns and GA.

## 2. Cost guardrails

- Monthly budgets and alerts per environment/provider.
- Unit economics: infrastructure, payment, logistics, messaging, support and refund cost per order.
- Log/trace sampling and retention based on diagnostic value and privacy risk.
- Automated cleanup for previews, stale objects and expired analytics data—never canonical/audit records without retention approval.
- No architectural complexity whose operating cost exceeds measured risk reduction.

## 3. Vendor selection

Score capability fit, authorization/compliance, security, uptime/history, Indonesian payment/logistics coverage, webhook/idempotency/reconciliation quality, sandbox, observability, support/escalation, pricing, data location/subprocessors, privacy terms, export/deletion, lock-in and exit assistance.

## 4. Exit plan

Every critical vendor adapter has canonical Yubie IDs/states, raw reference retention, export format, replacement mapping, dual-run/migration plan, credential revocation and customer impact plan. Provider-specific enums do not leak into the domain or UI.

## 5. Vendor incidents

Maintain status/support contacts and escalation tier. A vendor's “success” dashboard does not override Yubie's transaction and customer evidence; reconcile independently.
