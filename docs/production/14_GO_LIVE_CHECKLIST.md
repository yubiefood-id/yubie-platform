# 14 — Go-Live Checklist

Use this as an evidence record. `Yes` requires a link to current evidence and an accountable approver. `N/A` requires rationale.

## A. Product truth and food operations

- [ ] Exact sellable SKU/specification and final artwork approved.
- [ ] Ingredients, allergens, nutrition basis, net content, storage, preparation and shelf-life verified.
- [ ] Required BPOM/other registrations and label obligations verified for exact product/entity/channel.
- [ ] Halal status and current deadline/scope verified; public wording matches certificate/status.
- [ ] Public web/product API contains only approved effective claims.
- [ ] Released production lot exists with expiry/storage and supplier/manufacturer traceability.
- [ ] Quarantine, FEFO, complaint, withdrawal and recall processes verified by exercise.
- [ ] B2B samples are lot-traceable.

## B. Commerce and finance

- [ ] Server-owned prices/totals and explicit order/payment state machines.
- [ ] Idempotent checkout, payment session, webhook and refund proven under concurrency/duplicates.
- [ ] Licensed/authorized payment provider and merchant configuration verified.
- [ ] Signed webhook, inbox/outbox, retry/dead-letter and reconciliation operational.
- [ ] Inventory reservation/expiry/release and oversell controls verified.
- [ ] Refund/cancellation/return/customer policies approved and visible.
- [ ] Finance can reconcile transactions, refunds and settlement; exceptions have owner/SLA.

## C. Fulfilment and support

- [ ] Pack/ship flow captures exact lot and quantity.
- [ ] Carrier/logistics integration and exception/degraded procedure tested.
- [ ] Transactional messages are accurate, consent-independent and retryable.
- [ ] Support can view order/payment/shipment/lot timeline and escalate safety/privacy/security cases.
- [ ] Customer contact, complaint and recall communication templates approved.

## D. Security and privacy

- [ ] Threat model and applicable OWASP ASVS L2 controls reviewed.
- [ ] No raw card data/CVV; payment page/script scope reviewed.
- [ ] Operator MFA, least privilege, access review and audit trail verified.
- [ ] Secrets, rotation, dependency/secret scanning and incident revocation tested.
- [ ] Privacy notice, purposes, consent ledger, processors, retention and data-subject workflow approved.
- [ ] Logs/analytics/support exports verified free of prohibited secrets/personal data.
- [ ] High/critical findings resolved or formally accepted with owner/expiry.

## E. Reliability and release

- [ ] Clean install, lint, strict typecheck, tests, migration checks, production build and artifact validation pass.
- [ ] SLO dashboards and actionable alerts cover critical journeys.
- [ ] Backups/PITR enabled and isolated restore exercise passed.
- [ ] Capacity/spike/soak and dependency failure tests meet launch envelope.
- [ ] Rollout, feature flags, abort metrics, rollback/roll-forward and on-call coverage approved.
- [ ] Runbooks exercised for payment mismatch, inventory, provider outage, restore, privacy/security and food recall.
- [ ] Immutable release evidence packet retained.

## Go/no-go record

| Role | Name | Decision | Date | Evidence/conditions |
|---|---|---|---|---|
| Product/Regulatory |  |  |  |  |
| Food safety/Operations |  |  |  |  |
| Engineering/SRE/Security |  |  |  |  |
| Finance/Fulfilment/Support |  |  |  |  |
| Business owner |  |  |  |  |

Any unresolved critical item is **no-go**. Conditional approval includes owner, deadline and automatic rollback/disable condition.
