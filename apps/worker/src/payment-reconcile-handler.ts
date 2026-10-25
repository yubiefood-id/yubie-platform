import { reconcilePayments, SystemClock, CryptoIdGenerator } from "@yubie/application";
import { createCommercePaymentProvider } from "@yubie/integrations";
import {
  PostgresOrderRepository,
  PostgresPaymentRepository,
  PostgresTransactionManager,
  type Database,
} from "@yubie/persistence";
import { increment, setGauge } from "./metrics.js";

interface PaymentMetricRow {
  pending_age_seconds: string | number;
  callback_lag_seconds: string | number;
  unknown_hold_count: string | number;
  reconciliation_lag_seconds: string | number;
  reservation_age_seconds: string | number;
  amount_mismatch_count: string | number;
  settlement_exception_count: string | number;
}

function metricNumber(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    && /^[A-Z0-9_]{1,32}$/.test(error.code)
  ) return error.code;
  return error instanceof Error ? error.name : "UnknownError";
}

export interface PaymentReconcileMetricReport {
  polled: number;
  transitioned: number;
  staleDraftsCancelled: number;
  flaggedAmbiguous: number;
}

export function recordPaymentReconcileStart(): void {
  increment("payment_reconcile_runs_total");
}

export function recordPaymentReconcileMetrics(
  report: PaymentReconcileMetricReport,
  observedAtSeconds = Math.floor(Date.now() / 1000),
): void {
  increment("payment_reconcile_polled_total", report.polled);
  increment("payment_reconcile_transitioned_total", report.transitioned);
  increment("payment_reconcile_stale_drafts_cancelled_total", report.staleDraftsCancelled);
  increment("payment_reconcile_ambiguous_total", report.flaggedAmbiguous);
  setGauge("payment_reconcile_last_success_unixtime", observedAtSeconds);
}

export async function collectPaymentExceptionMetrics(database: Database): Promise<void> {
  const rows = await database.client.begin(async (sql) => {
    await sql`SET LOCAL statement_timeout = '8s'`;
    return sql<PaymentMetricRow[]>`
      SELECT
      COALESCE((
        SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))
        FROM order_payments
        WHERE status = 'pending'
      ), 0) AS pending_age_seconds,
      COALESCE((
        SELECT MAX(EXTRACT(EPOCH FROM (
          COALESCE(processed_at, NOW()) - received_at
        )))
        FROM webhook_inbox
        WHERE provider IN ('xendit', 'ipaymu')
          AND received_at > NOW() - INTERVAL '24 hours'
      ), 0) AS callback_lag_seconds,
      COALESCE((
        SELECT COUNT(*)
        FROM order_payments
        WHERE reconciliation_state IN (
          'ambiguous', 'ambiguous_create', 'pending_reconciliation', 'attach_failed'
        )
      ), 0) AS unknown_hold_count,
      COALESCE((
        SELECT EXTRACT(EPOCH FROM (NOW() - MIN(updated_at)))
        FROM order_payments
        WHERE reconciliation_state IN (
          'ambiguous', 'ambiguous_create', 'pending_reconciliation', 'attach_failed'
        )
      ), 0) AS reconciliation_lag_seconds,
      COALESCE((
        SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))
        FROM inventory_reservations
        WHERE status = 'active'
      ), 0) AS reservation_age_seconds,
      COALESCE((
        SELECT COUNT(*)
        FROM order_payments
        JOIN orders ON orders.id = order_payments.order_id
        WHERE order_payments.amount <> orders.grand_total_amount
          AND order_payments.status IN ('pending', 'succeeded', 'refunded')
      ), 0) AS amount_mismatch_count,
      COALESCE((
        SELECT COUNT(*)
        FROM order_payments
        JOIN orders ON orders.id = order_payments.order_id
        WHERE (order_payments.status = 'succeeded'
          AND orders.status NOT IN ('paid', 'processing', 'shipped', 'completed'))
          OR order_payments.reconciliation_state IN ('late_success_after_terminal', 'multiple_successful_transactions', 'provider_mismatch', 'other_payment_unresolved')
        ), 0) AS settlement_exception_count
    `;
  });
  const [row] = rows;
  if (!row) return;
  setGauge("payment_pending_age_seconds", metricNumber(row.pending_age_seconds));
  setGauge("payment_callback_lag_seconds", metricNumber(row.callback_lag_seconds));
  setGauge("payment_unknown_hold_count", metricNumber(row.unknown_hold_count));
  setGauge("payment_reconciliation_lag_seconds", metricNumber(row.reconciliation_lag_seconds));
  setGauge("payment_reservation_age_seconds", metricNumber(row.reservation_age_seconds));
  setGauge("payment_amount_mismatch_count", metricNumber(row.amount_mismatch_count));
  setGauge("payment_settlement_exception_count", metricNumber(row.settlement_exception_count));
}

/**
 * payment.reconcile worker entry: recovers every ambiguous boundary of the
 * checkout saga (stale drafts, pending payments past expiry, unknown provider
 * outcomes). Only runs when first-party payments are enabled — the same
 * fail-closed commerce config that gates the API gates this handler.
 */
export async function runPaymentReconcile(database: Database, correlationId = "worker_payment_reconcile"): Promise<void> {
  const provider = createCommercePaymentProvider(process.env);
  if (!provider) return;

  recordPaymentReconcileStart();
  let result: Awaited<ReturnType<typeof reconcilePayments>>;
  try {
    result = await reconcilePayments({
      tx: new PostgresTransactionManager(database),
      orders: new PostgresOrderRepository(database),
      payments: new PostgresPaymentRepository(database),
      provider,
      clock: new SystemClock(),
      ids: new CryptoIdGenerator(),
    });
  } catch (error: unknown) {
    increment("payment_reconcile_failures_total");
    console.error(JSON.stringify({
      level: "error",
      event: "worker.payment_reconcile_failed",
      correlationId,
      errorCode: safeErrorCode(error),
      at: new Date().toISOString(),
    }));
    throw error;
  }
  if (result.ok) {
    const { polled, transitioned, staleDraftsCancelled, flaggedAmbiguous } = result.value;
    recordPaymentReconcileMetrics(result.value);
    await collectPaymentExceptionMetrics(database).catch((error: unknown) => {
      increment("payment_metric_collection_failures_total");
      console.error(JSON.stringify({
        level: "error",
        event: "worker.payment_metric_collection_failed",
        correlationId,
        errorCode: safeErrorCode(error),
        at: new Date().toISOString(),
      }));
    });
    console.log(JSON.stringify({
      level: "info",
      event: "worker.payment_reconcile",
      correlationId,
      polled,
      transitioned,
      staleDraftsCancelled,
      flaggedAmbiguous,
      at: new Date().toISOString(),
    }));
    return;
  }
  increment("payment_reconcile_failures_total");
  console.error(JSON.stringify({
    level: "error",
    event: "worker.payment_reconcile_failed",
    correlationId,
    errorCode: result.error.code,
    at: new Date().toISOString(),
  }));
  throw new Error(`payment reconcile failed: ${result.error.code}`);
}
