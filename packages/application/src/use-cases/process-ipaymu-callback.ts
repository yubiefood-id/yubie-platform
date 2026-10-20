import { createHash } from "node:crypto";
import type { PaymentStatus } from "@yubie/domain";
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
  | { persisted: true; result: "applied" | "duplicate" | "pending" | "rejected" }
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
  if (input.merchant !== input.expectedMerchant || input.amount === null || !Number.isInteger(input.amount) || (input.currency != null && input.currency !== "IDR")) {
    return { persisted: true, result: "rejected" };
  }
  try {
    return await deps.tx.run("ipaymu.callback", async (repos) => {
      const orderResult = await repos.orders.findByCheckoutRef(input.referenceId);
      if (!orderResult.ok || !orderResult.value) return { persisted: false, result: "unavailable" as const };
      const order = orderResult.value;
      const payments = await repos.payments.findByOrderId(order.id);
      const payment = payments.ok ? payments.value[0] ?? null : null;
      if (!payment || payment.amount !== input.amount || payment.currency !== "IDR") {
        return { persisted: true, result: "rejected" as const };
      }
      if (payment.providerSessionId && input.sessionId && payment.providerSessionId !== input.sessionId) {
        return { persisted: true, result: "rejected" as const };
      }
      // A transaction-check status counts only when that response names this order and this amount.
      if (input.authoritativeStatus && (input.authoritativeReferenceId !== order.checkoutRef || input.authoritativeAmount !== payment.amount)) {
        return { persisted: true, result: "rejected" as const };
      }
      const inboxAppend = await repos.inbox.recordProcessed({
        provider: "ipaymu",
        deliveryId: input.dedupeKey,
        payloadHash: input.payloadHash ?? createHash("sha256").update(JSON.stringify([
          input.referenceId,
          input.merchant,
          input.amount,
          input.currency ?? null,
          input.trxId,
          input.sessionId,
        ])).digest("hex"),
        eventType: "ipaymu.callback",
        receivedAt: deps.clock.now(),
      });
      if (!inboxAppend.ok) return { persisted: false, result: "unavailable" as const };
      if (inboxAppend.value === "duplicate") return { persisted: true, result: "duplicate" as const };
      const recorded = await repos.paymentEvents.recordOnce({
        id: `pev_${deps.ids.nextId()}`,
        paymentId: payment.id,
        dedupeKey: input.dedupeKey,
        event: "ipaymu.callback",
        outcome: input.authoritativeStatus ?? "pending",
        receivedAt: deps.clock.now(),
      });
      if (!recorded.ok) return { persisted: false, result: "unavailable" as const };
      if (recorded.value === "duplicate") return { persisted: true, result: "duplicate" as const };

      const nextPayment = {
        ...payment,
        ...(input.sessionId ? { providerSessionId: payment.providerSessionId ?? input.sessionId } : {}),
        ...(input.trxId ? { providerPaymentId: input.trxId } : {}),
        updatedAt: deps.clock.now(),
      };
      if (!input.authoritativeStatus || input.authoritativeStatus === "pending") {
        await repos.payments.save({ ...nextPayment, reconciliationState: "pending_reconciliation" });
        return { persisted: true, result: "pending" as const };
      }
      const locked = await repos.payments.lockById(payment.id);
      if (!locked.ok || !locked.value) return { persisted: false, result: "unavailable" as const };
      await applyPaymentStatus(
        { ...repos, clock: deps.clock, ids: deps.ids },
        { ...locked.value, ...nextPayment, status: locked.value.status },
        order,
        input.authoritativeStatus,
      );
      return { persisted: true, result: "applied" as const };
    });
  } catch {
    return { persisted: false, result: "unavailable" };
  }
}
