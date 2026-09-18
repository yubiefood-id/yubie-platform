# Phase M8 — Direct Commerce Decision Gate

## 1. Purpose

M8 is a decision phase, not an automatic implementation phase.

The company asks whether yubie.id should begin owning direct D2C transaction execution.

## 2. Evidence required

Quantify:

- marketplace fees/margin;
- marketplace conversion;
- repeat-customer/CRM ownership limitations;
- checkout UX constraints;
- promotion/loyalty requirements;
- B2B direct-order needs;
- marketplace concentration risk;
- fulfilment/inventory readiness;
- payment/refund/support operations;
- regulatory/tax/accounting impact;
- engineering/operations cost.

## 3. Possible decisions

### Decision A — Stay marketplace-first

No first-party checkout. Continue improving channel/CRM/marketplace operations.

### Decision B — Hybrid

Direct web only for specific use case:

- B2B;
- subscription;
- bundles;
- limited product;
- special campaign.

### Decision C — Full D2C direct commerce

Yubie owns order/payment/refund/fulfilment flow.

## 4. Required ADR for B/C

The ADR must define:

- business case;
- payment provider;
- inventory/reservation owner;
- tax/invoice;
- returns/refunds;
- fraud/abuse;
- customer account needs;
- support;
- settlement reconciliation;
- PCI/payment-page scope;
- migration from preview commerce;
- rollout and rollback.

## 5. Re-activate dormant engineering controls

If direct commerce is approved, the previously designed controls become active:

~~~text
server-side quote
order state machine
idempotent checkout
inventory reservation
hosted payment
signed webhook inbox
payment reconciliation
refund state machine
fulfilment
exact lot/batch association
finance exception queue
~~~

## 6. Do not reuse marketplace order projections as order authority

Imported marketplace orders remain provider-owned projections. A new first-party order aggregate is separate.

## 7. Production gate

No direct-commerce launch until:

- product specifications/claims/certifications are approved;
- inventory/lot process is operational;
- payment provider is production-approved;
- refunds/support runbooks work;
- finance settlement reconciliation works;
- security/privacy/PCI scope reviewed;
- backup/recovery tested;
- controlled real order passes end-to-end.

## 8. Success criterion

M8 is successful when the company makes a documented evidence-based decision, including "do not build it."
