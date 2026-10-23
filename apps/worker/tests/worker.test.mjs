import assert from "node:assert/strict";
import test from "node:test";

test("worker package builds", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../dist/index.js"), "utf8");
  assert.match(index, /listing\.health/);
  assert.match(index, /assistant\.process/);
});

test("payment reconciliation publishes financial safety counters", async () => {
  const { recordPaymentReconcileMetrics, recordPaymentReconcileStart } = await import("../dist/payment-reconcile-handler.js");
  const { snapshotMetrics } = await import("../dist/metrics.js");
  const before = snapshotMetrics();

  recordPaymentReconcileStart();
  recordPaymentReconcileMetrics({
    polled: 7,
    transitioned: 3,
    staleDraftsCancelled: 2,
    flaggedAmbiguous: 1,
  }, 1_800_000_000);

  const after = snapshotMetrics();
  assert.equal(after.payment_reconcile_runs_total, (before.payment_reconcile_runs_total ?? 0) + 1);
  assert.equal(after.payment_reconcile_polled_total, (before.payment_reconcile_polled_total ?? 0) + 7);
  assert.equal(after.payment_reconcile_transitioned_total, (before.payment_reconcile_transitioned_total ?? 0) + 3);
  assert.equal(after.payment_reconcile_stale_drafts_cancelled_total, (before.payment_reconcile_stale_drafts_cancelled_total ?? 0) + 2);
  assert.equal(after.payment_reconcile_ambiguous_total, (before.payment_reconcile_ambiguous_total ?? 0) + 1);
  assert.equal(after.payment_reconcile_last_success_unixtime, 1_800_000_000);
});

test("bot-off production keeps payment recovery running: SUPPORT_PROVIDER=disabled no-ops the commerce-gated reconciler cleanly", async () => {
  const { runPaymentReconcile } = await import("../dist/payment-reconcile-handler.js");
  const names = ["SUPPORT_PROVIDER", "COMMERCE_PROVIDER", "XENDIT_SECRET_KEY", "IPAYMU_ENV", "IPAYMU_VA", "IPAYMU_API_KEY", "IPAYMU_NOTIFY_URL"];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.SUPPORT_PROVIDER = "disabled";
    process.env.COMMERCE_PROVIDER = "preview";
    // With no payment provider configured the reconciler must return without
    // touching the database — support being disabled must not interfere.
    await assert.doesNotReject(() => runPaymentReconcile({} , "worker_test_bot_off"));
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("worker package gates support queues behind the disabled flag", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../dist/index.js"), "utf8");
  assert.match(index, /supportDisabled/);
  assert.match(index, /if \(!supportDisabled\)/);
});
