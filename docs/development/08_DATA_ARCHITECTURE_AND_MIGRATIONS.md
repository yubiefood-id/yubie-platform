# 08 — Data Architecture, Schemas and Migrations

## 1. Data planes

| Plane | Purpose | Authority |
|---|---|---|
| Transactional | Orders, payment observations, inventory, lots, fulfilment, consent, truth and audit | Managed PostgreSQL is canonical. |
| Object/evidence | Evidence files, approved artwork, reports and exports | Object bytes in private storage; metadata/checksum/approval in PostgreSQL. |
| Operational telemetry | Logs, traces, metrics and job/provider health | Diagnostic only; never transaction truth. |
| Analytical | Funnel and business aggregates | Derived; revenue reconciles to canonical paid/refunded records. |
| Browser/local | Cart convenience and device preferences | Non-authoritative and replaceable. |

## 2. Logical schemas

Use database schemas or naming boundaries to make ownership visible:

| Boundary | Representative tables |
|---|---|
| `truth` | products, specifications, variants, claims, evidence, approvals, artworks, publications |
| `commerce` | price_lists, prices, cart_quotes, orders, order_lines, adjustments |
| `payment` | intents, attempts, provider_events, refunds, settlements, reconciliation_exceptions |
| `inventory` | locations, lots, movements, reservations, allocations, recall_actions |
| `fulfilment` | packages, shipments, tracking_events, exceptions, returns |
| `customer` | contacts, addresses, consents, waitlist_subscriptions, data_requests |
| `b2b` | leads, activities, sample_requests, sample_shipments, crm_syncs |
| `platform` | idempotency_keys, webhook_inbox, outbox, job_attempts, audit_events, operator_tasks |

Physical schema separation is optional initially; transactional integrity across modules is not.

## 3. Key constraints

- Unique canonical email uses normalized form plus original display value; never deduplicate solely by name.
- Consent uniqueness includes contact, purpose, channel, policy/version and current lifecycle semantics.
- Waitlist uniqueness includes contact + product scope + active lifecycle; retries return existing record.
- Provider event ID is unique within provider/account/environment.
- Idempotency key is unique within principal/scope/operation and stores canonical request hash.
- Order number/public token are unique and non-enumerable externally.
- Price has currency, effective window and non-overlap constraint per price list/variant where possible.
- Lot code is unique within owning facility/manufacturer context and references exact specification/variant.
- Inventory cannot be reserved from a non-released or incompatible lot.
- Money and quantities use integers/decimals with explicit checks; no floating-point storage.

## 4. Transaction patterns

### Durable lead capture

Normalize contact → resolve idempotency/deduplication → insert/update purpose-specific consent → insert waitlist/B2B record → append audit/outbox → commit → return stable reference. CRM/email delivery occurs after commit.

### Checkout

Lock/validate quote → verify prices and sellable inventory → create order snapshot → create reservations → write idempotency result + audit + outbox → commit. Payment session creation follows a recoverable policy documented in the commerce guide.

### Webhook

Verify raw signature/time → insert inbox event once → acknowledge. Worker locks inbox/aggregate, validates transition, records provider observation + state/audit/outbox and commits. Duplicate delivery returns prior result.

## 5. Migration policy

1. Generate reviewable SQL; application code does not auto-migrate production on boot.
2. CI proves clean bootstrap and upgrade from the oldest supported schema snapshot.
3. Use expand/contract: add → deploy compatible code → backfill → verify → constrain → remove in later release.
4. Analyze table locks, rewrite behavior, transaction duration and rollback/roll-forward for each production migration.
5. Backfills are resumable, idempotent, rate-limited, observable and checkpointed.
6. Destructive changes require backup/restore evidence and explicit owner approval.
7. Schema and application releases retain a documented compatibility window.

## 6. Seed and test data

- Local/CI use synthetic Indonesian addresses, phone formats, lots, expiry dates and provider fixtures.
- Product fixtures distinguish approved Flour projections from coming-soon Shake/Ppang.
- Never copy production customer/provider exports into local, preview or CI.
- Staging test recipients are allowlisted/sinked so exercises cannot message real customers.

## 7. Evidence objects

Database metadata includes object key, checksum, byte size, media type, classification, owner, supplier/issuer, effective/expiry dates, linked specification/claim/artwork, scan status and immutable upload audit. Public routes receive derived approval facts, never storage keys or raw documents.

## 8. Retention and deletion engineering

Retention is purpose- and category-specific. Jobs first produce a reviewable candidate set, honor legal/safety/dispute holds, then delete or anonymize with audit evidence. Consent withdrawal stops future marketing promptly but does not erase necessary order, tax, safety, fraud or dispute records.

## 9. Recovery development requirements

- Automated backup and point-in-time recovery for production database.
- Restore into isolated environment and run application invariant checks.
- Reconcile restored outbox/inbox/payment state before traffic resumes.
- Initial engineering targets: RPO ≤15 minutes for order/payment state and RTO ≤4 hours, pending business approval.
