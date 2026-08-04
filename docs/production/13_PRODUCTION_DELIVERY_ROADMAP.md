# 13 — Production Delivery Roadmap

## Principle

Sequence by dependency and risk. Do not connect live payment before product truth, transactional persistence, idempotency, operator visibility and reconciliation foundations exist.

## Milestone P0 — Governance and evidence

- Owners/RACI, policies, product evidence pack and claim inventory.
- Lot/release/FEFO/complaint/recall process and sample traceability.
- Regulatory/provider decisions recorded as ADRs.
- Exit: Yubie can name exactly what may be sold/said and who approves it.

## Milestone P1 — Transactional core

- PostgreSQL schema/migrations for catalog spec/claims, order, payment, inventory/lot, consent, outbox/inbox/audit.
- Repository ports and integration tests; backup/PITR and first restore.
- Exit: canonical state survives restart and concurrent retries.

## Milestone P2 — Idempotent checkout

- Server-owned price/totals, reservation, idempotency and order state machine.
- Operator order view and structured errors.
- Exit: duplicate/concurrent requests cannot duplicate committed outcome or oversell.

## Milestone P3 — Payment integration

- Provider due diligence/ADR, hosted payment session, signed webhook inbox, normalized events, retries, reconciliation, refund workflow.
- Exit: sandbox end-to-end and failure matrix pass; no card data enters Yubie.

## Milestone P4 — Fulfilment and communications

- FEFO lot allocation, pack/ship/tracking, transactional email, customer timeline, support/exception flow.
- Exit: paid order reaches delivered/refunded with complete audit and lot traceability.

## Milestone P5 — Production controls

- SLO telemetry/alerts/runbooks, access/MFA, privacy workflows, scans/penetration test, load/soak, backup restore, payment reconciliation and recall exercise.
- Exit: all critical controls verified and operational.

## Milestone P6 — Progressive launch

1. Staff/internal real transaction with controlled SKU/lot.
2. Small invited customer cohort and daily reconciliation.
3. Limited public traffic with capacity/operations hold.
4. General availability after gate review and stable observation window.

Abort signals: product-truth mismatch, food-safety issue, duplicate/ambiguous payment, oversell, unreconciled material variance, privacy/security incident, unowned critical alert or inability to fulfil/support safely.

## Post-GA

Stabilize before growth features. Prioritize defects, reconciliation automation, operator efficiency and repeat-purchase evidence before subscription, loyalty or microservice expansion.
