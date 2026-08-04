# 18 — Development Definition of Done and PR Template

## 1. Slice definition of ready

Before implementation:

- customer/operator outcome and non-goals are explicit;
- applicable product-truth/food-operation requirements are identified;
- state transitions, invariants and authorization are defined;
- API/data/migration and provider boundaries are understood;
- failure, retry, reconciliation, observability, rollout and rollback are planned;
- dependencies and accountable reviewers are named.

## 2. Definition of done

A development slice is complete only when applicable items pass:

### Product and domain

- [ ] Outcome is measurable and no unsupported product fact is introduced.
- [ ] Aggregate/state transitions and forbidden transitions are explicit.
- [ ] Idempotency, concurrency and compensating behavior are implemented.
- [ ] Customer and operator recovery paths exist.

### Data and API

- [ ] Schema constraints enforce final integrity; migration is forward-safe and tested.
- [ ] Retention/classification and sensitive fields are documented.
- [ ] Transport schemas, stable errors, auth and authorization are tested.
- [ ] Provider/webhook contracts handle timeout, retry, duplicate and unknown state.

### UX and access

- [ ] Loading, empty, validation, conflict, dependency error and success states are usable.
- [ ] Keyboard, focus, labels/status and responsive behavior meet the accessibility contract.
- [ ] UI does not treat local/projection/provider state as canonical incorrectly.
- [ ] Operator action captures reason/audit and uses least privilege.

### Quality and operations

- [ ] Unit, integration, contract and end-to-end tests match the risk.
- [ ] Logs/metrics/traces/business events are useful and redacted.
- [ ] SLO/alert/runbook impact is updated.
- [ ] Locked install, lint, typecheck, tests, migration checks and build pass.
- [ ] Progressive rollout, abort signal and rollback/roll-forward are documented.
- [ ] Relevant development and production docs are updated.

## 3. Pull request template

```markdown
## Outcome
Customer/operator result and why this slice is the next dependency.

## Scope / non-goals
- Included:
- Excluded:

## Product truth and food-safety impact
- Specification/claim/lot/complaint implications:
- Required owner approval/evidence:

## Architecture
- C4 containers/components touched:
- Domain state/invariants:
- Provider/integration boundary:

## API and data
- Contract changes:
- Migration/backfill/compatibility:
- Idempotency/concurrency/reconciliation:
- Privacy/classification/retention:

## UX and operator recovery
- Customer states:
- Operator visibility/action:
- Accessibility evidence:

## Verification
- Automated checks:
- Failure/security scenarios:
- Observability evidence:

## Release
- Flag/cohort:
- Abort signals:
- Rollback/roll-forward:
- Residual risk and owner:
```

## 4. Reviewer matrix

| Change | Required reviewer attention |
|---|---|
| Product facts, specification, artwork, claims | Product/regulatory/food-safety owner |
| Lot release, inventory, recall, complaint | Food-safety/operations owner |
| Payment/refund/reconciliation | Finance/payment owner + security |
| Consent, customer/contact/address, data request | Privacy/security owner |
| Fulfilment/returns/3PL | Fulfilment/support owner |
| B2B sample | B2B + food-safety/fulfilment owner |
| SLO/alerts/backup/deployment | Platform/on-call owner |

## 5. Prohibited completion shortcuts

- Green UI snapshot without durable use case or failure path.
- Green build while migration, provider sandbox or operator workflow is unverified.
- Marking payment successful from redirect/client callback.
- Accepting a form and showing success without durable capture.
- Making a SKU available without exact approved product and released-lot evidence.
- Disabling a flaky critical test or alert without owner, risk and expiry.
- Merging documentation/implementation drift as “follow-up” when it changes an invariant.
