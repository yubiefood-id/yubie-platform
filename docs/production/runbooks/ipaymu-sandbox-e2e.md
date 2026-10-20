# iPaymu Sandbox End-to-End Acceptance

M2 passes only when every step below has recorded evidence. The
`iPaymu sandbox probe` workflow covers step 2 alone; its best result is
`CREATE_SESSION_PASS`, which is not payment acceptance.

This runbook never authorizes production hosts, production credentials,
changing shared staging away from `COMMERCE_PROVIDER=preview`, or real money.

## Preconditions (owner)

- GitHub environment `sandbox` exists with required reviewers and holds
  `IPAYMU_SANDBOX_VA` and `IPAYMU_SANDBOX_API_KEY` (the sandbox pair the project
  already uses).
- An isolated sandbox API instance is approved: its own database (restored
  from a staging backup or empty and migrated through `0013`), its own
  hostname reachable by iPaymu for callbacks, `COMMERCE_PROVIDER=ipaymu`,
  `IPAYMU_ENV=sandbox`, `IPAYMU_API_BASE_URL=https://sandbox.ipaymu.com`, and
  `IPAYMU_NOTIFY_URL=https://<isolated-host>/v1/webhooks/ipaymu`.
  Shared staging stays on preview.
- Written iPaymu answers on: session cancel, transaction lookup by
  reference, and behaviour for a duplicate reference.

## Steps and required evidence

Record the commit SHA, image digest, UTC timestamps, checkout reference, and
the request id (`x-request-id`) for each step. Never record the VA, API key,
signature, or customer email.

1. **Release under test.** Isolated instance `/healthz` returns the reviewed
   `releaseSha`; `/readyz` is 200; migrations through `0013` applied.
2. **Create session.** Dispatch the probe workflow (main, `confirm=sandbox`,
   `expected_sha=<sha>`), or check out on the isolated storefront. Evidence:
   `CREATE_SESSION_PASS`, redirect host `sandbox.ipaymu.com`.
3. **Successful payment.** Complete payment in the sandbox UI. Evidence: one
   `api.ipaymu_webhook` event with `outcome=applied`; order `paid`;
   reservations `consumed` exactly once; no second provider session.
4. **Callback replay.** Re-deliver the same callback. Evidence:
   `outcome=duplicate`; stock and order unchanged.
5. **Browser return before callback.** Return to the success page before the
   callback arrives. Evidence: page shows pending, then confirmed after the
   callback; the browser never marks the order paid.
6. **Expiry / cancel.** Let a second session expire or cancel it. Evidence:
   order cancelled; reservations released exactly once; a late success callback
   is `stale`.
7. **Amount and reference mismatch.** Send a signed callback with a wrong
   amount (sandbox tooling or recorded fixture). Evidence: `rejected` with
   `payment_amount_mismatch`; order unchanged.
8. **Reconciler.** With a pending payment past expiry, run `payment.reconcile`.
   Evidence: `worker.payment_reconcile` log with the job correlation id;
   `/ops/payments/exceptions` lists only unresolved items.
9. **Duplicate submit.** Submit the same cart twice with new idempotency keys.
   Evidence: one order, one intent, one provider session.
10. **Teardown.** Stop the isolated instance; confirm shared staging still
    reports `COMMERCE_PROVIDER=preview`.

## Result

| Step | Result | Evidence link |
|---|---|---|
| 1–10 | NOT_RUN | |

M2 = PASS only if all ten are PASS. Any FAIL keeps first-party payments off.
