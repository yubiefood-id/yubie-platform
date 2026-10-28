import type { OperationsOutbox } from "@yubie/application";
import { increment, setGauge } from "./metrics.js";

export async function processOperationsOutbox(store: OperationsOutbox, reconcile: (paymentId: string) => Promise<void>) {
  const events = await store.claim(20);
  let completed = 0, failed = 0;
  for (const event of events) {
    try {
      if (event.eventType === "ops.payment_reconcile_requested") await reconcile(event.aggregateId);
      else if (!["ops.changed", "inventory.count_applied", "inventory.recall_hold"].includes(event.eventType)) throw new Error("Unsupported operations event");
      // ops.changed is a committed internal audit notification; it sends no customer messages.
      await store.complete(event); completed++;
    } catch { await store.retry(event); failed++; }
  }
  increment("operations_outbox_completed_total", completed);
  increment("operations_outbox_failed_total", failed);
  setGauge("operations_outbox_last_sweep_unixtime", Math.floor(Date.now()/1000));
  return { completed, failed };
}
