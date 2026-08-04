# 07 — Domain Model and State Machines

## 1. Modeling rules

- Use opaque identifiers and explicit value objects for money, quantity, weight, email/phone, time window and provider references.
- Money is integer minor units plus ISO currency; quantities include unit and precision.
- State changes occur through named domain commands/policies, never arbitrary property mutation.
- Approved product specifications, claims and financial history are superseded/compensated, not rewritten.
- Order lines snapshot what the customer bought and what Yubie represented at purchase time.

## 2. Core aggregate map

```mermaid
erDiagram
  PRODUCT ||--o{ SPECIFICATION : versions
  SPECIFICATION ||--o{ VARIANT : defines
  SPECIFICATION ||--o{ CLAIM_APPROVAL : governs
  VARIANT ||--o{ PRICE : priced_by
  VARIANT ||--o{ LOT : produced_as
  ORDER ||--|{ ORDER_LINE : contains
  ORDER ||--o{ PAYMENT_ATTEMPT : paid_by
  ORDER ||--o{ RESERVATION : reserves
  LOT ||--o{ RESERVATION : allocated_from
  ORDER ||--o{ SHIPMENT : fulfilled_by
```

## 3. Product truth lifecycle

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> InReview
  InReview --> Approved
  InReview --> Rejected
  Approved --> Effective
  Effective --> Superseded
  Effective --> Suspended
  Suspended --> Effective: reapproved
```

Publication requires the effective specification, effective claim approvals, matching artwork scope, and non-expired evidence. A new formula, net content, SKU form, label or protected fact creates a new version/review rather than mutating the approved record.

## 4. Waitlist lifecycle

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Active: confirmed or approved policy
  Pending --> Expired
  Active --> Notified: launch notification sent
  Active --> Unsubscribed
  Notified --> Unsubscribed
  Active --> Suppressed
  Notified --> Suppressed
```

Waitlist interest is per product/variant family and purpose. It is not an order, reservation, price promise or launch-date commitment.

## 5. B2B lead lifecycle

```mermaid
stateDiagram-v2
  [*] --> New
  New --> Qualified
  New --> Disqualified
  Qualified --> SampleApproved
  SampleApproved --> SampleSent
  SampleSent --> Evaluating
  Evaluating --> Opportunity
  Opportunity --> Won
  Opportunity --> Lost
```

Every nonterminal qualified state has owner, next action and due date. Sample approval does not bypass lot release, inventory movement or recipient traceability.

## 6. Order and payment separation

Order states:

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> PendingPayment
  PendingPayment --> Paid
  PendingPayment --> PaymentExpired
  Paid --> Allocated
  Allocated --> Packed
  Packed --> Shipped
  Shipped --> Delivered
  Paid --> CancelPending
  CancelPending --> Cancelled
```

Payment attempt states:

```mermaid
stateDiagram-v2
  [*] --> Created
  Created --> ActionRequired
  ActionRequired --> Processing
  Processing --> Succeeded
  Processing --> Failed
  ActionRequired --> Expired
  Succeeded --> PartiallyRefunded
  PartiallyRefunded --> Refunded
  Succeeded --> Refunded
```

The browser redirect never moves `PendingPayment` to `Paid`. Only a verified event or reconciliation result may do so.

## 7. Inventory and lot state

Lot lifecycle: `received → quarantined → released → depleted/expired`; released lots may move to `quarantined` or `recalled` at any time. Sellable quantity is derived from released, compatible, non-expired, non-recalled balance minus active reservations and safety buffer.

Inventory movements are append-only: receive, release, reserve, reservation release, pick/consume, return pending inspection, damage, expiry, quarantine, recall and correction. A correction references the error and compensates it; it does not delete history.

## 8. Transition contract

Every transition definition contains:

- command and authorized actor;
- current/next state and forbidden states;
- required product/lot/payment predicates;
- idempotency identity;
- database lock/transaction scope;
- movement/financial/audit effects;
- outbox events and operator task;
- customer-visible consequence;
- timeout/expiry and compensating action;
- unit and integration tests.

## 9. Current model migration

The existing `Product`, `ProductSize`, `Order` and `ProductClaim` interfaces remain useful public/prototype projections. Do not grow them into universal persistence entities. Introduce internal aggregates/value objects and map them to stable public DTOs so product-truth history, multiple price lists, attempts, lots and audit do not leak into customer responses.
