import { paymentStatusFromProviderSession, type AppError } from "@yubie/domain";
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
 *    (its link was never returned to a browser), so it is cancelled and its
 *    reservations released;
 *  - anything the provider cannot answer stays flagged "ambiguous" for an
 *    operator — reconciliation never guesses and never re-creates sessions.
 *
 * There is deliberately NO time-based reservation sweep: stock is released
 * only through a definitive payment/order transition (webhook or authoritative
 * poll) or the stale-draft cancel. A locally-expired reservation whose payment
 * outcome is unknown stays unavailable until resolved — selling reserved
 * stock that a customer may still have paid for is the failure this design
 * refuses to allow.
 */
export async function reconcilePayments(deps: ReconcilePaymentsDeps): Promise<{ ok: true; value: ReconcilePaymentsReport } | { ok: false; error: AppError }> {
  const now = deps.clock.now();
  const report: ReconcilePaymentsReport = { polled: 0, transitioned: 0, staleDraftsCancelled: 0, flaggedAmbiguous: 0 };

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
      if (!session.ok) continue; // Provider unreachable: retry on the next cron tick; never release on a guess.
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
        // Lock the payment row: a webhook may be transitioning it concurrently.
        const locked = await repos.payments.lockById(payment.id);
        if (!locked.ok || !locked.value || locked.value.status !== "pending") return false;
        const freshOrder = await repos.orders.findById(payment.orderId);
        if (!freshOrder.ok || !freshOrder.value) return false;
        const effect = await applyPaymentStatus({ ...repos, clock: deps.clock, ids: deps.ids }, locked.value, freshOrder.value, target);
        return effect === "applied";
      });
      if (moved) report.transitioned += 1;
    }
  }

  const staleBefore = new Date(Date.parse(now) - STALE_DRAFT_AGE_MS).toISOString();
  const staleResult = await deps.orders.listStaleDrafts(staleBefore, BATCH_LIMIT);
  if (staleResult.ok) {
    for (const order of staleResult.value) {
      // A draft carrying an ATTACHED session id is an attach-failure
      // compensation candidate: the session exists at the provider, so its
      // state is authoritative and queryable. Resolve it definitively —
      // provider calls happen OUTSIDE any transaction, local writes inside one.
      const attachCandidate = await deps.tx.run("reconcile.inspect_draft", async (repos) => {
        const payments = await repos.payments.findByOrderId(order.id);
        const payment = payments.ok ? payments.value[0] ?? null : null;
        const freshOrder = await repos.orders.findById(order.id);
        if (!freshOrder.ok || freshOrder.value?.status !== "draft") return null;
        if (!payment || !payment.providerSessionId) return { kind: "no_session" as const, orderId: order.id };
        if (payment.reconciliationState === "attach_failed") return { kind: "attach_failed" as const, orderId: order.id, payment };
        return { kind: "ambiguous" as const, orderId: order.id, payment };
      });
      if (!attachCandidate) continue;

      if (attachCandidate.kind === "attach_failed") {
        const payment = attachCandidate.payment;
        if (payment.providerSessionId === null) continue; // type-narrow; guarded above
        const poll = await deps.provider.getPaymentSession(payment.providerSessionId);
        if (poll.ok && poll.value && poll.value.rawStatus === "ACTIVE") {
          // The link was never delivered to a browser; cancel the session so
          // it can never be paid, then close the draft and release stock.
          const cancelled = await deps.provider.cancelPaymentSession(payment.providerSessionId);
          if (cancelled.ok && cancelled.value.accepted) {
            const done = await deps.tx.run("reconcile.cancel_attach_failed", async (repos) => {
              const freshOrder = await repos.orders.findById(order.id);
              const freshPayments = await repos.payments.findByOrderId(order.id);
              const fresh = freshPayments.ok ? freshPayments.value[0] ?? null : null;
              if (!freshOrder.ok || freshOrder.value?.status !== "draft" || !fresh) return false;
              await repos.orders.save({ ...freshOrder.value, status: "cancelled", updatedAt: deps.clock.now() });
              await repos.payments.save({ ...fresh, status: "cancelled", reconciliationState: "attach_failed_cancelled", updatedAt: deps.clock.now() });
              await repos.inventory.releaseForOrder(order.id, "attach_failed_cancelled", deps.clock.now());
              await repos.audit.append({ action: "order.attach_failed_cancelled", resourceType: "order", resourceId: order.id, actor: "reconcile", occurredAt: deps.clock.now() });
              return true;
            });
            if (done) report.staleDraftsCancelled += 1;
            continue;
          }
          // Cancel did not succeed: keep the draft open and flagged.
          await deps.tx.run("reconcile.flag_ambiguous", async (repos) => {
            await repos.payments.save({ ...payment, reconciliationState: "ambiguous", updatedAt: deps.clock.now() });
            await repos.audit.append({ action: "payment.reconcile_flagged", resourceType: "payment", resourceId: payment.id, actor: "reconcile", occurredAt: deps.clock.now() });
          });
          report.flaggedAmbiguous += 1;
          continue;
        }
        if (poll.ok && poll.value) {
          const target = paymentStatusFromProviderSession(poll.value.rawStatus);
          if (target) {
            const moved = await deps.tx.run("reconcile.apply_poll", async (repos) => {
              const locked = await repos.payments.lockById(payment.id);
              if (!locked.ok || !locked.value || locked.value.status !== "pending") return false;
              const freshOrder = await repos.orders.findById(order.id);
              if (!freshOrder.ok || !freshOrder.value) return false;
              const effect = await applyPaymentStatus({ ...repos, clock: deps.clock, ids: deps.ids }, locked.value, freshOrder.value, target);
              return effect === "applied";
            });
            if (moved) report.transitioned += 1;
            continue;
          }
        }
        // Provider unreachable or status unclear: flag, never guess.
        await deps.tx.run("reconcile.flag_ambiguous", async (repos) => {
          await repos.payments.save({ ...payment, reconciliationState: "ambiguous", updatedAt: deps.clock.now() });
          await repos.audit.append({ action: "payment.reconcile_flagged", resourceType: "payment", resourceId: payment.id, actor: "reconcile", occurredAt: deps.clock.now() });
        });
        report.flaggedAmbiguous += 1;
        continue;
      }

      if (attachCandidate.kind === "ambiguous") {
        // A session id without the attach_failed marker is an unexpected
        // state: surface it for an operator rather than acting on it.
        const payment = attachCandidate.payment;
        if (payment.reconciliationState !== "ambiguous") {
          await deps.tx.run("reconcile.flag_ambiguous", async (repos) => {
            await repos.payments.save({ ...payment, reconciliationState: "ambiguous", updatedAt: deps.clock.now() });
            await repos.audit.append({ action: "payment.reconcile_flagged", resourceType: "payment", resourceId: payment.id, actor: "reconcile", occurredAt: deps.clock.now() });
          });
          report.flaggedAmbiguous += 1;
        }
        continue;
      }

      // No session id anywhere: the payment link was never delivered, so the
      // draft can never be paid. Cancel it and release its reservations.
      const cancelled = await deps.tx.run("reconcile.cancel_stale_draft", async (repos) => {
        const freshOrder = await repos.orders.findById(order.id);
        const payments = await repos.payments.findByOrderId(order.id);
        const payment = payments.ok ? payments.value[0] ?? null : null;
        if (!freshOrder.ok || freshOrder.value?.status !== "draft") return false;
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

  return { ok: true, value: report };
}
