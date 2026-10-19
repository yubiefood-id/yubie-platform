import { reconcilePayments, SystemClock, CryptoIdGenerator } from "@yubie/application";
import { createCommercePaymentProvider } from "@yubie/integrations";
import {
  PostgresOrderRepository,
  PostgresPaymentRepository,
  PostgresTransactionManager,
  type Database,
} from "@yubie/persistence";

function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...fields, at: new Date().toISOString() }));
}

/**
 * payment.reconcile worker entry: recovers every ambiguous boundary of the
 * checkout saga (stale drafts, pending payments past expiry, unknown provider
 * outcomes). Only runs when first-party payments are enabled — the same
 * fail-closed commerce config that gates the API gates this handler.
 */
export async function runPaymentReconcile(database: Database): Promise<void> {
  const provider = createCommercePaymentProvider(process.env);
  if (!provider) return;

  const result = await reconcilePayments({
    tx: new PostgresTransactionManager(database),
    orders: new PostgresOrderRepository(database),
    payments: new PostgresPaymentRepository(database),
    provider,
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
  });
  if (result.ok) {
    const { polled, transitioned, staleDraftsCancelled, flaggedAmbiguous } = result.value;
    logEvent("worker.payment_reconcile", { polled, transitioned, staleDraftsCancelled, flaggedAmbiguous });
  }
}
