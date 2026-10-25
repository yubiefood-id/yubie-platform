# Payment Exceptions and Safe Recovery

This runbook applies to first-party checkout in staging or production. It does
not authorize enabling a provider, changing `COMMERCE_PROVIDER`, releasing
inventory, refunding money, or deploying infrastructure.

## Safety invariants

- The database is the order and reservation authority; the payment provider is
  authoritative for provider payment state.
- An unknown create/callback result is a hold, not a failure. Keep the same
  idempotency key and do not create a second payable session.
- Never infer payment success from a browser redirect.
- Never edit payment/order rows manually. Recover through the reconciler or an
  reviewed repair command with an audit event.
- Logs, tickets, and chat must not contain callback bodies, tokens, customer
  email/address, or provider credentials.
- ERP stock writes remain disabled.

## Correlation and evidence

Use these non-PII identifiers:

1. `x-request-id` returned by every API response;
2. `checkoutRef` for web, database, and provider-reference correlation;
3. `paymentId` and `orderId` from the protected exception read model;
4. worker `correlationId` (`worker_<pg-boss-job-id>`) for a reconciliation run;
5. immutable release SHA.

Preserve a timeline containing identifiers, timestamps, release SHA, provider
status, and operator actions. Do not copy raw webhook bodies.

## Signals

Worker `GET /metrics` exposes:

| Metric | Meaning |
|---|---|
| `payment_pending_age_seconds` | Age of the oldest pending payment |
| `payment_callback_lag_seconds` | Worst receive-to-process callback lag in the last 24 hours |
| `payment_unknown_hold_count` | Ambiguous/create/attach states that prohibit a second session |
| `payment_reconciliation_lag_seconds` | Age of the oldest unresolved reconciliation state |
| `payment_reservation_age_seconds` | Age of the oldest active inventory reservation |
| `payment_amount_mismatch_count` | Payment amount differs from canonical order total |
| `payment_settlement_exception_count` | Succeeded payment without a paid-or-later order |
| `payment_reconcile_*_total` | Reconcile runs, transitions, ambiguous flags, failures |
| `payment_reconcile_last_success_unixtime` | Last successful reconciliation run |

Log-derived counters:

- `api.payment_webhook` / `api.ipaymu_webhook` with `outcome=duplicate`;
- rejected webhook outcome/code for verification or business mismatch;
- `worker.payment_reconcile_failed`;
- callback HTTP 4xx/5xx by provider and route.

The protected, read-only endpoint
`GET /ops/payments/exceptions?limit=50&cursor=...` requires `OPS_API_TOKEN`.
It returns stable cursor pagination and excludes customer PII.

## Initial alert thresholds

Thresholds are deliberately conservative until staging load establishes a
baseline:

| Condition | Severity | Action |
|---|---|---|
| amount mismatch or settlement exception > 0 | SEV-1 | Freeze payment rollout; investigate immediately |
| callback auth/business mismatch > 0 from an expected provider source | SEV-1 security | Reject, preserve metadata, verify provider configuration |
| unknown hold > 0 for 15 minutes | SEV-2 | Reconcile provider state; prohibit a second session |
| reconcile last success older than 10 minutes or failures > 0 | SEV-2 | Restore worker/queue before changing customer state |
| callback lag > 300 seconds | SEV-2 | Check callback reachability and worker/database health |
| pending payment age > provider expiry plus 10 minutes | SEV-2 | Poll provider, then expire only from authoritative status |
| active reservation age > 30 minutes | SEV-3 | Check matching pending payment before release |
| duplicate callback ratio > 20% for 15 minutes | SEV-3 | Check provider retries; duplicates remain no-op |

Financial-correctness error budget is zero amount/settlement mismatches. Payment
availability target is 99.9% monthly only after sandbox and staging acceptance;
availability never overrides correctness.

## Ambiguous payment procedure

1. Keep the storefront/provider mode unchanged. If broad impact exists, set
   `YUBIE_CHECKOUT_ADMISSION=disabled` through the approved configuration/deploy path, preserving the PSP.
2. Record `x-request-id`, `checkoutRef`, release SHA, and first observed time.
3. Query the protected exception endpoint and provider dashboard/API using the
   same `checkoutRef`. Do not run create-session again.
4. If provider state is terminal, let `payment.reconcile` apply the existing
   transition idempotently.
5. If provider state remains unknown, keep inventory held and escalate to the
   provider with timestamps and reference only.
6. Confirm the order, payment, event, outbox, audit, and reservation states
   agree before customer communication.
7. Close only after a second operator verifies the terminal state.

## Callback failure procedure

1. Leave invalid callbacks rejected. Do not bypass token/signature/business or
   amount checks.
2. Distinguish provider redelivery (`duplicate`, safe no-op) from verification
   failure, poison payload, and database failure.
3. Verify callback reachability, expected provider host/account, clock, and
   configured callback authentication without printing credentials.
4. Poll authoritative provider state by existing session/reference.
5. Replay only a preserved provider delivery through an approved, audited
   process; never hand-craft a successful callback.

## In-flight drain and rollback

Before payment application rollback:

1. stop new checkout with `YUBIE_CHECKOUT_ADMISSION=disabled`, preserving
   the configured PSP through the approved release/configuration path;
2. keep callback ingress and the reconciliation worker running;
3. wait until active requests finish and the reconcile queue has no overdue
   job;
4. snapshot exception metrics and the protected read model;
5. roll back application images by immutable digest, not tag;
6. do not roll back migrations while newer code/data may depend on them;
7. re-run health/readiness, callback rejection, duplicate callback, and
   reconciliation checks;
8. keep admission disabled until all unknown holds are resolved.

If the rollback image cannot safely read the current schema, stop and restore
forward with a compatible image. Database restore is a separate incident
procedure and must preserve provider reconciliation evidence.

## Customer messaging

- **Unknown:** “Kami sedang memverifikasi status pembayaran Anda. Jangan
  melakukan pembayaran kedua untuk pesanan ini.”
- **Confirmed paid:** acknowledge only after provider and database agree.
- **Confirmed unpaid/expired:** state that no successful payment was confirmed
  and provide the approved retry path.
- **Refund:** never promise timing not supplied by the provider; include the
  stable order reference, not internal/provider credentials.

Support must not label an unknown outcome “failed” merely to unblock a retry.


## Durable iPaymu notification inbox (0024+)

Ingress validates the signature and merchant, stores only minimal payment
correlation fields, and acknowledges after persistence. The independent
`payment.notifications` worker retrieves authoritative state. Incomplete
lookups remain retryable with the transaction ID retained. Rejections and
exceptions retain their reason and emit dedicated worker metrics/logs; a
`provider_mismatch` payment is listed in protected exception views and requires
investigation before reopening admission. Never discard a received transaction
ID merely because its first lookup was incomplete.

`payment_notification_pending_count` and
`payment_notification_oldest_age_seconds` expose inbox backlog. A rejected or
exception outcome from an expected provider is a financial incident: freeze
new admission, retain the PSP and recover the exact attempt. Do not delete
inbox rows to clear an alert.

A recalled or expired lot at settlement records a fulfillment hold while keeping
verified payment truth. Recalling a lot later also holds affected unshipped
orders. Operations must inspect those holds before fulfillment; routine count
onboarding cannot re-release recalled lots.
