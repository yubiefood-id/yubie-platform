import { createHash } from "node:crypto";
import type { PaymentStatus, UseCaseResult } from "@yubie/domain";
import type { Clock, IdGenerator, TransactionManager } from "../ports.js";
import { applyPaymentStatus } from "./process-payment-webhook.js";

export interface IpaymuCallbackInput {
  referenceId: string;
  merchant: string;
  expectedMerchant: string;
  amount: number | null;
  /** Present only when the callback names a currency. Anything other than IDR is rejected. */
  currency?: string | null;
  authoritativeStatus: PaymentStatus | null;
  /** Reference and amount from the same transaction-check response as the status. */
  authoritativeReferenceId: string | null;
  authoritativeAmount: number | null;
  /** SHA-256 of the exact callback bytes when available at the HTTP boundary. */
  payloadHash?: string;
  trxId: string | null;
  sessionId: string | null;
  dedupeKey: string;
}

export type IpaymuCallbackResult =
  | { persisted: true; result: "applied" | "duplicate" | "pending" | "stale" }
  | { persisted: true; result: "exception"; reason: "late_success_after_terminal" | "multiple_successful_transactions" }
  | {
      persisted: true;
      result: "rejected";
      reason:
        | "merchant_mismatch"
        | "callback_amount_invalid"
        | "currency_mismatch"
        | "payment_amount_mismatch"
        | "session_mismatch"
        | "authoritative_mismatch";
    }
  | { persisted: false; result: "unavailable" };

/**
 * Applies an already signature-checked iPaymu callback.
 * A claimed success does not mark the order paid unless authoritativeStatus
 * is succeeded from the transaction-check API. Stock is not released here
 * unless that check says the payment is expired, failed, or cancelled.
 */
export async function applyIpaymuCallback(
  input: IpaymuCallbackInput,
  deps: { tx: TransactionManager; clock: Clock; ids: IdGenerator },
): Promise<IpaymuCallbackResult> {
  if (input.merchant !== input.expectedMerchant) return { persisted: true, result: "rejected", reason: "merchant_mismatch" };
  if (input.amount === null || !Number.isInteger(input.amount)) return { persisted: true, result: "rejected", reason: "callback_amount_invalid" };
  if (input.currency != null && input.currency !== "IDR") return { persisted: true, result: "rejected", reason: "currency_mismatch" };
  try {
    return await deps.tx.run("ipaymu.callback", async (repos) => {
      const orderResult = await repos.orders.findByCheckoutRef(input.referenceId);
      if (!orderResult.ok || !orderResult.value) return { persisted: false, result: "unavailable" as const };
      const order = orderResult.value;
      const payments = await repos.payments.findByOrderId(order.id);
      if (!payments.ok) return { persisted: false, result: "unavailable" as const };
      const candidate = payments.value.find((payment) => payment.provider === "ipaymu");
      if (!candidate) {
        return { persisted: false, result: "unavailable" as const };
      }
      // Every callback, including pending deliveries, serializes on the same
      // row. Never merge a pre-lock snapshot over a concurrent paid result.
      const payment = requireResult(await repos.payments.lockById(candidate.id));
      if (!payment || payment.currency !== "IDR") throw new Error("Payment unavailable");
      const currentOrder = requireResult(await repos.orders.findById(order.id));
      if (!currentOrder) throw new Error("Order unavailable");
      if (payment.amount !== input.amount) {
        return { persisted: true, result: "rejected" as const, reason: "payment_amount_mismatch" as const };
      }
      if (payment.providerSessionId && input.sessionId && payment.providerSessionId !== input.sessionId) {
        return { persisted: true, result: "rejected" as const, reason: "session_mismatch" as const };
      }
      // A transaction-check status counts only when that response names this order and this amount.
      if (input.authoritativeStatus && (input.authoritativeReferenceId !== order.checkoutRef || input.authoritativeAmount !== payment.amount)) {
        return { persisted: true, result: "rejected" as const, reason: "authoritative_mismatch" as const };
      }
      const inboxAppend = await repos.inbox.recordProcessed({
        provider: "ipaymu",
        deliveryId: input.dedupeKey,
        // Inbox identity includes the authoritative lookup outcome: unchanged
        // signed callback bytes may be redelivered after a failed lookup.
        payloadHash: createHash("sha256").update(JSON.stringify([
          input.payloadHash ?? null,
          input.referenceId,
          input.merchant,
          input.amount,
          input.currency ?? null,
          input.trxId,
          input.sessionId,
          input.authoritativeStatus,
        ])).digest("hex"),
        eventType: "ipaymu.callback",
        receivedAt: deps.clock.now(),
      });
      if (requireResult(inboxAppend) === "duplicate") return { persisted: true, result: "duplicate" as const };

      const lateSuccess = input.authoritativeStatus === "succeeded"
        && ["expired", "failed", "cancelled", "refunded"].includes(payment.status);
      const secondTransaction = input.authoritativeStatus === "succeeded"
        && payment.status === "succeeded"
        && Boolean(payment.providerPaymentId && input.trxId && payment.providerPaymentId !== input.trxId);
      const exceptionReason = lateSuccess ? "late_success_after_terminal" as const
        : secondTransaction ? "multiple_successful_transactions" as const : null;
      const recorded = await repos.paymentEvents.recordOnce({
        id: `pev_${deps.ids.nextId()}`,
        paymentId: payment.id,
        dedupeKey: input.dedupeKey,
        event: "ipaymu.callback",
        outcome: exceptionReason ?? input.authoritativeStatus ?? "pending",
        receivedAt: deps.clock.now(),
      });
      if (requireResult(recorded) === "duplicate") return { persisted: true, result: "duplicate" as const };

      const nextPayment = {
        ...payment,
        ...(input.sessionId ? { providerSessionId: payment.providerSessionId ?? input.sessionId } : {}),
        ...(input.trxId ? { providerPaymentId: input.trxId } : {}),
        updatedAt: deps.clock.now(),
      };
      if (exceptionReason) {
        const now = deps.clock.now();
        requireResult(await repos.payments.save({
          ...payment,
          providerPaymentId: payment.providerPaymentId ?? input.trxId,
          reconciliationState: exceptionReason,
          updatedAt: now,
        }));
        requireResult(await repos.audit.append({ action: "payment.exception", resourceType: "payment", resourceId: payment.id, actor: "payment-webhook", occurredAt: now }));
        requireResult(await repos.outbox.enqueue({
          eventType: "payment.exception", aggregateType: "payment", aggregateId: payment.id,
          dedupeKey: `payment:exception:${payment.id}:${exceptionReason}:${input.trxId ?? "unknown"}`,
          payloadJson: JSON.stringify({ reason: exceptionReason, orderId: order.id, paymentId: payment.id, providerPaymentId: input.trxId, recordedProviderPaymentId: payment.providerPaymentId ?? null }),
          availableAt: now,
        }));
        return { persisted: true, result: "exception" as const, reason: exceptionReason };
      }
      if (!input.authoritativeStatus || input.authoritativeStatus === "pending") {
        if (payment.status !== "pending") return { persisted: true, result: "stale" as const };
        requireResult(await repos.payments.save({ ...nextPayment, reconciliationState: "pending_reconciliation" }));
        return { persisted: true, result: "pending" as const };
      }
      const effect = await applyPaymentStatus(
        { ...repos, clock: deps.clock, ids: deps.ids },
        nextPayment,
        currentOrder,
        input.authoritativeStatus,
      );
      if (effect === "stale") return { persisted: true, result: "stale" as const };
      return { persisted: true, result: "applied" as const };
    });
  } catch {
    return { persisted: false, result: "unavailable" };
  }
}

/** Returning an error from inside run() would COMMIT an already-appended inbox. */
function requireResult<T>(result: UseCaseResult<T>): T {
  if (!result.ok) throw new Error("Payment callback persistence unavailable");
  return result.value;
}
