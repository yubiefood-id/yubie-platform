# 03 — Data Model and Persistence

## 1. Canonical entities

| Aggregate | Key records |
|---|---|
| Catalog/truth | product, specification, variant, claim, evidence, artwork, approval |
| Commerce | price list, cart snapshot, order, order line, adjustment, refund |
| Payment | payment intent, attempt, provider event, settlement/reconciliation item |
| Inventory | location, lot, balance, reservation, movement, quarantine/recall action |
| Fulfilment | shipment, package, tracking event, delivery/return exception |
| Customer/privacy | customer/contact, address, consent ledger, data request |
| Operations | complaint, B2B lead/sample, audit event, incident reference |
| Reliability | webhook inbox, transactional outbox, job attempt, idempotency key |

## 2. Data invariants

- Money uses integer minor units with explicit currency; never floating point.
- Order lines snapshot product name, variant, approved public facts, price, tax/discount and unit at purchase time.
- Financial records are append-oriented; corrections use compensating entries/refunds.
- Inventory is a movement ledger with derived balances, not an overwrite-only quantity.
- Reservations have expiry and release reason; fulfillment consumes a reservation/lot atomically.
- Public identifiers are opaque and non-sequential; internal keys may be numeric/UUID.
- Timestamps are UTC; business dates/timezone are explicit (`Asia/Jakarta` where relevant).
- Claim and specification versions are immutable after approval; supersede rather than rewrite.

## 3. Transaction boundaries

Checkout creates order, lines, totals, reservation, idempotency record, audit event and outbox event atomically. Webhook processing inserts inbox record once, locks relevant payment/order state, applies a valid transition, adds audit/outbox records, and commits atomically.

Use unique constraints for provider event IDs, idempotency scope/key, order number, payment provider/reference, lot code within owner/location, and active reservation uniqueness where applicable.

## 4. Migrations

- Forward-only, reviewed SQL migrations with deterministic order.
- Expand/contract for incompatible changes: add nullable/backfilled field → dual-read/write if required → migrate → enforce → remove later.
- No destructive production migration without tested backup, explicit approval, bounded lock analysis and recovery path.
- Large backfills are resumable, rate-limited, observable and separate from request deploys.
- CI creates a fresh database and upgrades from the oldest supported production schema snapshot.

## 5. Backup and recovery

Initial targets: automated backups with point-in-time recovery, encrypted copies, restricted restore permissions, quarterly restore exercise, documented RPO ≤15 minutes for order/payment data and RTO ≤4 hours for the transactional platform. Tighten targets based on order volume and contractual needs.

A backup is not verified until restored into an isolated environment and application-level invariants are checked.

## 6. Classification and retention

Classify: public, internal, confidential, restricted. Customer contact/address, consent, support records and provider references are confidential/restricted. Raw card data and CVV are prohibited.

Maintain a retention schedule tied to legal, tax, product-safety, dispute, and operational needs. Delete or anonymize data when purpose/retention ends, while preserving legally required immutable records. Data-subject requests must not erase evidence required for active disputes, safety/recall, fraud, or law; document the lawful decision and scope.
