import { paymentStatusFromProviderSession, type AppError, type PaymentRecord } from "@yubie/domain";
import type { Clock, IdGenerator, OrderRepository, PaymentProviderPort, PaymentRepository, TransactionManager } from "../ports.js";
import { applyPaymentStatus } from "./process-payment-webhook.js";

export interface ReconcilePaymentsDeps {
  tx: TransactionManager;
  orders: OrderRepository;
  payments: PaymentRepository;
  provider: PaymentProviderPort;
  clock: Clock;
  ids: IdGenerator;
}

export interface ReconcilePaymentsReport {
  /** Pending payments past expiry that were polled at the provider. */
  polled: number;
  /** Polls that moved payment/order state. */
  transitioned: number;
  /** Stale drafts cancelled — their payment link was never delivered. */
  staleDraftsCancelled: number;
  /** Payments flagged for operator attention (unknown provider outcome). */
  flaggedAmbiguous: number;
  /** Abandoned-checkout reservations released back to sellable stock. */
  reservationsReleased: number;
}

/** Drafts older than this are cancelled by reconciliation. */
const STALE_DRAFT_AGE_MS = 15 * 60 * 1000;
const BATCH_LIMIT = 50;

/**
 * Periodic recovery for every ambiguous boundary of the checkout saga and the
 * webhook path:
 *  - a still-pending payment past expiry is polled once at the provider and
 *    transitions exactly like the webhook would (never from a redirect);
 *  - a draft order older than the stale window could never have been paid
 *    (its link was never returned to a browser), so it is cancelled;
 *  - anything the provider cannot answer stays flagged "ambiguous" for an
 *    operator — reconciliation never guesses and never re-creates sessions.
 */
export async function reconcilePayments(deps: ReconcilePaymentsDeps): Promise<{ ok: true; value: ReconcilePaymentsReport } | { ok: false; error: AppError }> {
  const now = deps.clock.now();
  const report: ReconcilePaymentsReport = { polled: 0, transitioned: 0, staleDraftsCancelled: 0, flaggedAmbiguous: 0, reservationsReleased: 0 };

  const expiredResult = await deps.payments.listPendingExpired(now, BATCH_LIMIT);
  if (expiredResult.ok) {
    for (const payment of expiredResult.value) {
      if (!payment.providerSessionId) {
        await deps.tx.run("reconcile.flag_missing_session", async (repos) => {
          await repos.payments.save({ ...payment, reconciliationState: "ambiguous", updatedAt: deps.clock.now() });
          await repos.audit.append({ action: "payment.reconcile_flagged", resourceType: "payment", resourceId: payment.id, actor: "reconcile", occurredAt: deps.clock.now() });
        });
        report.flaggedAmbiguous += 1;
        continue;
      }
      report.polled += 1;
      const session = await deps.provider.getPaymentSession(payment.providerSessionId);
      if (!session.ok) continue; // Provider unreachable: retry on the next cron tick.
      if (!session.value) {
        await deps.tx.run("reconcile.flag_missing_session", async (repos) => {
          await repos.payments.save({ ...payment, reconciliationState: "ambiguous", updatedAt: deps.clock.now() });
          await repos.audit.append({ action: "payment.reconcile_flagged", resourceType: "payment", resourceId: payment.id, actor: "reconcile", occurredAt: deps.clock.now() });
        });
        report.flaggedAmbiguous += 1;
        continue;
      }
      const target = paymentStatusFromProviderSession(session.value.rawStatus);
      if (!target) continue;
      const moved = await deps.tx.run("reconcile.apply_poll", async (repos) => {
        const freshOrder = await repos.orders.findById(payment.orderId);
        const freshPayments = await repos.payments.findByOrderId(payment.orderId);
        const fresh = findPayment(freshPayments, payment);
        if (freshOrder.ok && freshOrder.value && fresh && fresh.status === "pending") {
          await applyPaymentStatus({ ...repos, clock: deps.clock, ids: deps.ids }, fresh, freshOrder.value, target);
          return true;
        }
        return false;
      });
      if (moved) report.transitioned += 1;
    }
  }

  const staleBefore = new Date(Date.parse(now) - STALE_DRAFT_AGE_MS).toISOString();
  const staleResult = await deps.orders.listStaleDrafts(staleBefore, BATCH_LIMIT);
  if (staleResult.ok) {
    for (const order of staleResult.value) {
      const cancelled = await deps.tx.run("reconcile.cancel_stale_draft", async (repos) => {
        const freshOrder = await repos.orders.findById(order.id);
        const payments = await repos.payments.findByOrderId(order.id);
        const payment = payments.ok ? payments.value[0] ?? null : null;
        if (!freshOrder.ok || freshOrder.value?.status !== "draft") return false;
        if (payment && payment.providerSessionId) {
          // A session id should only exist after TX2 (pending_payment). A
          // draft with an attached session is an unknown provider outcome:
          // flag it, never cancel it blind.
          if (payment.reconciliationState !== "ambiguous") {
            await repos.payments.save({ ...payment, reconciliationState: "ambiguous", updatedAt: deps.clock.now() });
            await repos.audit.append({ action: "payment.reconcile_flagged", resourceType: "payment", resourceId: payment.id, actor: "reconcile", occurredAt: deps.clock.now() });
            report.flaggedAmbiguous += 1;
          }
          return false;
        }
        await repos.orders.save({ ...freshOrder.value, status: "cancelled", updatedAt: deps.clock.now() });
        if (payment && payment.status === "pending") {
          await repos.payments.save({ ...payment, status: "expired", reconciliationState: "stale_draft_cancelled", updatedAt: deps.clock.now() });
        }
        await repos.inventory.releaseForOrder(order.id, "stale_draft_cancelled", deps.clock.now());
        await repos.audit.append({ action: "order.stale_draft_cancelled", resourceType: "order", resourceId: order.id, actor: "reconcile", occurredAt: deps.clock.now() });
        return true;
      });
      if (cancelled) report.staleDraftsCancelled += 1;
    }
  }

  // Abandoned checkouts: active reservations past their expiry window go back
  // to sellable stock.
  const reservationSweep = await deps.tx.run("reconcile.release_reservations", async (repos) =>
    repos.inventory.releaseExpired(now, BATCH_LIMIT),
  );
  if (reservationSweep.ok) report.reservationsReleased = reservationSweep.value.released;

  return { ok: true, value: report };
}

function findPayment(result: { ok: boolean; value?: PaymentRecord[] }, payment: PaymentRecord): PaymentRecord | null {
  if (!result.ok || !result.value) return null;
  return result.value.find((item) => item.id === payment.id) ?? null;
}
