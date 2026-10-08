import { reconcilePayments, SystemClock, CryptoIdGenerator } from "@yubie/application";
import { XenditPaymentProvider } from "@yubie/integrations";
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
  if (process.env.COMMERCE_PROVIDER !== "xendit" || !process.env.XENDIT_SECRET_KEY) return;

  const result = await reconcilePayments({
    tx: new PostgresTransactionManager(database),
    orders: new PostgresOrderRepository(database),
    payments: new PostgresPaymentRepository(database),
    provider: new XenditPaymentProvider({
      secretKey: process.env.XENDIT_SECRET_KEY,
      ...(process.env.XENDIT_API_BASE_URL ? { apiBaseUrl: process.env.XENDIT_API_BASE_URL } : {}),
    }),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
  });
  if (result.ok) {
    const { polled, transitioned, staleDraftsCancelled, flaggedAmbiguous } = result.value;
    logEvent("worker.payment_reconcile", { polled, transitioned, staleDraftsCancelled, flaggedAmbiguous });
  }
}
