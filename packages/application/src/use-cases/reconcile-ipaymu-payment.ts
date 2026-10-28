import { paymentStatusFromProviderSession } from "@yubie/domain";
import type { Clock, IdGenerator, PaymentProviderPort, TransactionManager } from "../ports.js";
import { applyIpaymuCallback } from "./process-ipaymu-callback.js";
import { flagPaymentMismatch, paymentSessionMatches } from "./payment-session-verification.js";

/** Explicit Finance status query. No create, cancel, inferred signature, or callback receipt. */
export async function reconcileIpaymuPayment(paymentId: string, deps: {
  tx: TransactionManager; provider: PaymentProviderPort; merchant: string; clock: Clock; ids: IdGenerator;
}) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(paymentId) || !deps.merchant) throw new Error("Payment lookup configuration unavailable");
  const snapshot = await deps.tx.run("payment.poll.inspect", async repos => {
    const payment = await repos.payments.findById(paymentId);
    if (!payment.ok || !payment.value || payment.value.provider !== "ipaymu") throw new Error("Payment lookup provider mismatch or unavailable");
    const order = await repos.orders.findById(payment.value.orderId);
    const attempts = await repos.payments.findByOrderId(payment.value.orderId);
    if (!order.ok || !order.value || !attempts.ok) throw new Error("Payment lookup persistence unavailable");
    return { payment: payment.value, order: order.value, others: attempts.value.filter(p => p.id !== paymentId) };
  });
  const { payment, order } = snapshot;
  if (snapshot.others.some(p => !["failed","expired","cancelled"].includes(p.status) || p.reconciliationState && !["provider_create_failed","stale_draft_cancelled","attach_failed_cancelled"].includes(p.reconciliationState))) {
    await flagPaymentMismatch(paymentId, deps); throw new Error("Payment lookup requires review of other unresolved attempts");
  }
  const checked = await deps.provider.getPaymentSession(payment.providerSessionId ?? "", { providerPaymentId: payment.providerPaymentId ?? null, referenceId: order.checkoutRef });
  if (!checked.ok || !checked.value) throw new Error("Authoritative payment lookup unavailable; keep request retryable");
  const observed = checked.value;
  if (!paymentSessionMatches(payment,order,observed) || payment.amount !== order.totals.grandTotalAmount || observed.providerBusinessId && observed.providerBusinessId !== deps.merchant) {
    await flagPaymentMismatch(paymentId,deps); return { observed: true, outcome: "exception", reason: "provider_mismatch" };
  }
  const status = paymentStatusFromProviderSession(observed.rawStatus)
    ?? (["PENDING", "ACTIVE"].includes(observed.rawStatus.toUpperCase()) ? "pending" : null);
  if (!status) throw new Error("Authoritative payment lookup status is unknown");
  const outcome = await applyIpaymuCallback({ observationSource: "poll", expectedPaymentId: paymentId, referenceId: order.checkoutRef, merchant: deps.merchant, expectedMerchant: deps.merchant, amount: payment.amount, currency: payment.currency, trxId: observed.providerPaymentId ?? payment.providerPaymentId ?? null, sessionId: payment.providerSessionId, authoritativeSessionId: observed.providerSessionId, authoritativeStatus: status, authoritativeReferenceId: observed.referenceId ?? null, authoritativeAmount: observed.amount ?? null, dedupeKey: `ipaymu-poll:${paymentId}:${observed.providerPaymentId ?? payment.providerPaymentId ?? "unknown"}:${status}` },deps);
  if (!outcome.persisted) throw new Error("Payment lookup persistence unavailable");
  if (outcome.result === "rejected") { await flagPaymentMismatch(paymentId,deps); return { observed: true, outcome: "exception", reason: outcome.reason }; }
  return { observed: true, outcome: outcome.result };
}
