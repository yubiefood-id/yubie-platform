# 17 — Development Delivery Plan, Epics and Dependencies

## 1. Delivery principle

Build thin vertical slices that leave a durable, observable and operable outcome. Do not implement every database table first, every UI first or every provider adapter first. Each slice crosses domain → persistence → application → API → customer/operator surface → tests/telemetry.

## 2. Phase mapping

Development phases `D0–D7` implement production milestones `P0–P6` from the production roadmap.

| Development phase | Outcome | Production mapping |
|---|---|---|
| D0 Engineering guardrails | Dependency rules, contracts, local DB harness, migration CI, request/error/idempotency primitives | Enables P1 |
| D1 Durable demand capture | Waitlist, newsletter and B2B leads with consent/outbox/operator read | P1 foundation |
| D2 Product truth + inventory foundation | Specification/claim/evidence projection, lot receipt/release/movement | P0/P1 |
| D3 Quote, order and reservation | Server quote, durable order, concurrent lot reservation, operator order view | P2 |
| D4 Hosted payment | Provider session, webhook inbox, transition, reconciliation, refund controls | P3 |
| D5 Fulfilment + support | FEFO allocation, pack/ship/events, communications, complaint and return flow | P4 |
| D6 Production controls | Auth/RBAC, privacy workflows, dashboards/alerts, restore/load/security/recall exercises | P5 |
| D7 Progressive launch | Staff → invited → limited public → GA with abort gates | P6 |

## 3. D0 — Engineering guardrails

Deliverables:

- `packages/application`, persistence/integration seams and dependency graph enforcement;
- typed configuration, request IDs, error envelope and domain error mapping;
- PostgreSQL local/CI harness, migration bootstrap/upgrade and repository test pattern;
- idempotency, audit, inbox/outbox primitives;
- OpenAPI/schema generation or drift test;
- operator identity/provider decision recorded before protected routes.

Exit: a sample command commits state, audit and outbox atomically; retry returns identical result; migration proves clean and upgrade path.

## 4. D1 — Durable demand capture

Epics:

1. Product waitlist for Shake/Ppang with purpose-specific consent.
2. Newsletter consent/preferences/suppression.
3. B2B lead capture, assignment task and local operator list/detail.
4. Email/CRM adapters through outbox with sinked staging behavior.
5. Consent withdrawal and data discovery baseline.

Exit: restart/provider outage cannot lose a valid submission; public response avoids enumeration; operator sees delivery/sync state.

## 5. D2 — Product truth and lot foundation

Epics:

1. Specification/variant/claim/evidence/approval model and public projection.
2. Versioned prices and product availability projection.
3. Inventory location, lot, release/quarantine and movement ledger.
4. Product/regulatory and food-safety operator workflows.
5. Expiry/suppression jobs and audit.

Exit: only matching effective approved facts publish; only compatible released lots contribute sellability.

## 6. D3 — Quote, order and reservation

Epics:

1. Server cart quote with change/conflict response.
2. Checkout contact/address and signed anonymous session.
3. Durable order/line snapshot/idempotency.
4. Concurrent reservation and expiry worker.
5. Support order search/timeline baseline.

Exit: concurrency and retry tests prove no duplicate order or oversell; browser prices cannot control total.

## 7. D4 — Payment

Epics:

1. Provider ADR/due diligence and hosted session adapter.
2. Verified webhook endpoint and inbox processor.
3. Payment/order transitions, late/unknown-state handling.
4. Customer confirmation/status and transaction communication.
5. Refund request/approval and reconciliation exception console.

Exit: sandbox failure matrix passes; finance can reconcile every attempt/refund; no card data enters Yubie.

## 8. D5 — Fulfilment and support

Epics:

1. FEFO allocation and pack verification.
2. Shipment/provider adapter and tracking reconciliation.
3. Customer timeline and operational notifications.
4. Returns/disposition, structured complaints and safety escalation.
5. B2B sample shipment through same lot traceability.

Exit: order/sample traces to lot; paid order reaches delivery/refund/exception with owned operator task.

## 9. D6/D7 — Control and launch

Complete least-privilege operator access, consent/data requests, SLO telemetry/alerts/runbooks, provider degraded modes, backup restore, load/soak, security review, payment reconciliation drill and lot recall exercise. Launch progressively with feature flags/cohorts and explicit abort signals from production documents.

## 10. Backlog priority formula

Prioritize by dependency unlock + customer/operator value + risk reduction, then divide by effort/uncertainty. Launch-blocking safety/transaction integrity overrides cosmetic conversion work. Every epic has owner, measurable outcome, dependencies, threat/failure cases, data/API impact, tests, telemetry and production gate.

## 11. Explicitly deferred until evidence

- Microservices/Kubernetes/multi-region active-active.
- Customer accounts, loyalty, subscriptions and complex promotions.
- Wholesale self-service/credit ordering.
- AI-generated public product claims or automated regulatory approval.
- Marketplace sellers and custom payment processing.
