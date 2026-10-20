# Financial invariants

These must hold for every checkout. Each one names the test that enforces it. "Open on `6a2f451`" means the merged code violates it today and M1 fixes it.

| # | Invariant | State on `6a2f451` | Enforced by |
|---|---|---|---|
| F1 | The amount sent to the provider equals `order_payments.amount` equals the order grand total (subtotal + shipping + tax − discount). | Open: iPaymu items sum to the undiscounted subtotal without shipping, so every YUBIE15 or nonzero-shipping order is rejected | M1 promo tests |
| F2 | A grand total of zero, a negative total, or a total above the configured cap never reaches the provider. | Open: no guard before TX1 | M1 promo tests |
| F3 | One principal plus one canonical cart has at most one unresolved payment intent, for guests and signed-in users. | Open for guests: the principal is the literal `"guest"` and `principal_key` is null | M1 guest intent and concurrency tests |
| F4 | The request hash depends on cart content, not JSON byte order. | Open: raw body bytes are hashed | M1 canonical hash test |
| F5 | Concurrent identical submits create one order, one payment row, one provider session, and never oversell the last unit. | Open: a unique violation in TX1 surfaces as an error | M1 Postgres concurrency tests (2, 10, 100) |
| F6 | An ambiguous provider outcome (timeout, throw after accept, DB failure before TX2) never releases stock and never opens a second session. | Partly covered by mock tests | M1 recovery tests |
| F7 | Only a verified, authoritative provider status moves a payment to `paid`. Forged, replayed, reordered, wrong-merchant, wrong-amount, wrong-currency, and status 6 (unsettled) callbacks never do. | Covered by mock tests in `packages/application/tests/ipaymu-callback.test.mjs` | M1 invariant suite on Postgres |
| F8 | ERP never receives stock writes while dual mastering is unproven. | PASS: `erpStockWriteDecision()` refuses | `packages/application/tests/erp-authority.test.mjs` |

Master-prompt cases A (duplicate submit), B (promo and shipping totals), C (timeout recovery), and E (callback integrity) map to F3–F5, F1–F2, F6, and F7.
