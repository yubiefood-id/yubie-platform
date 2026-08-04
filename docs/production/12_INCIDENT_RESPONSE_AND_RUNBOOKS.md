# 12 — Incident Response and Runbooks

## 1. Incident classes

| Class | Examples | Lead |
|---|---|---|
| Platform | outage, latency, database, deployment | Engineering incident commander |
| Transaction | duplicate/missing payment, oversell, reconciliation drift | Engineering + Finance/Ops |
| Security | account compromise, malicious access, secret exposure | Security/Engineering lead |
| Privacy | unauthorized disclosure, lost export, consent failure | Privacy lead |
| Fulfilment | carrier outage, lost/damaged batch, warehouse failure | Operations lead |
| Food safety | illness/allergen/contamination/mislabel/recall | Food-safety lead |

## 2. Severity

- **SEV-1:** immediate safety risk, confirmed major data/payment integrity loss, widespread purchase failure or critical compromise.
- **SEV-2:** substantial customer/operational impact with workaround or bounded scope.
- **SEV-3:** limited impact requiring timely correction.
- **SEV-4:** low-impact defect or observation.

Severity may increase as evidence changes. Food-safety and privacy owners determine external notification obligations with qualified counsel/regulators.

## 3. Command structure

Incident commander owns priorities and cadence; technical/operations leads investigate; communications lead handles approved internal/customer/vendor/regulator messages; scribe maintains timeline, decisions and evidence. Responders do not speculate publicly.

## 4. Universal response

1. Detect and declare; assign severity and leads.
2. Protect people and contain further harm.
3. Preserve evidence and timeline; avoid destructive cleanup.
4. Establish impact using canonical records.
5. Mitigate with safest reversible action.
6. Communicate on a predictable cadence.
7. Recover and verify invariants/reconciliation.
8. Close only with owner approval; write blameless review and tracked actions.

## 5. Required runbooks

### Payment mismatch/duplicate

Disable affected operation/provider path if needed; preserve provider events; compare idempotency/inbox/order/payment/settlement; stop automated fulfilment for ambiguous orders; coordinate refund only after verified state; reconcile all potentially affected records.

### Inventory oversell/negative balance

Pause affected SKU; lock lot/location; identify reservations/movements/orders; prioritize customer communication and approved substitution/refund; repair via compensating movement; add invariant/test.

### Food complaint/recall

Escalate immediately; collect complaint details without diagnosing; identify SKU/lot/order; quarantine related stock; stop sale/fulfilment; map all recipients including samples; food-safety owner determines regulator/supplier/customer actions; record contact/disposition; rehearse before launch.

### Privacy/security event

Revoke/rotate access, isolate affected path, preserve logs/evidence, determine data/scope/subjects, prevent further disclosure, involve privacy/security/counsel, meet applicable notification duties, avoid placing sensitive data in incident chat.

### Database restore

Declare change freeze; select recovery point; restore isolated; validate schema and order/payment/inventory/lot invariants; reconcile webhooks/outbox/provider settlement after recovery point; approve cutover; monitor.

## 6. Post-incident review

Timeline, impact, detection gap, contributing technical/operational factors, what worked, root/system causes, customer/financial/safety outcomes, and actions with owner/severity/due date. Measure action completion, not document publication.

Use [NIST incident-response guidance](https://csrc.nist.gov/pubs/sp/800/61/r3/final) as a reference baseline and adapt it to Yubie's size and risks.
