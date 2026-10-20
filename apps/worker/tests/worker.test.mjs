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
