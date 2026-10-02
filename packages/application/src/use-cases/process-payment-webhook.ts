import { timingSafeEqual } from "node:crypto";
import {
  canTransitionOrder,
  err,
  ok,
  orderStatusForPayment,
  type AppError,
  type OrderRecord,
  type PaymentEventRecord,
  type PaymentProviderKind,
  type PaymentRecord,
  type PaymentStatus,
} from "@yubie/domain";
import type { Clock, IdGenerator, OrderRepository, PaymentEventRepository, PaymentRepository } from "../ports.js";

/** Constant-time comparison for the Xendit x-callback-token. */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export interface PaymentTransitionDeps {
  orders: OrderRepository;
  payments: PaymentRepository;
  paymentEvents: PaymentEventRepository;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Applies a verified payment status to the payment + order records. Safe to
 * call twice: repeat transitions are ignored (idempotent order writes).
 */
export async function applyPaymentStatus(
  deps: PaymentTransitionDeps,
  payment: PaymentRecord,
  order: OrderRecord,
  status: PaymentStatus,
): Promise<void> {
  const now = deps.clock.now();
  await deps.payments.save({ ...payment, status, updatedAt: now });
  const targetOrderStatus = orderStatusForPayment(status);
  if (targetOrderStatus === null) return;
  if (order.status === targetOrderStatus) return;
  if (!canTransitionOrder(order.status, targetOrderStatus)) return;
  await deps.orders.save({ ...order, status: targetOrderStatus, updatedAt: now });
}

async function recordEvent(
  deps: PaymentTransitionDeps,
  paymentId: string,
  dedupeKey: string,
  event: string,
  outcome: string,
) {
  await deps.paymentEvents.recordOnce({
    id: `pev_${deps.ids.nextId()}`,
    paymentId,
    dedupeKey,
    event,
    outcome,
    receivedAt: deps.clock.now(),
  } satisfies PaymentEventRecord);
}

export interface XenditWebhookData {
  payment_session_id?: unknown;
  reference_id?: unknown;
  business_id?: unknown;
  currency?: unknown;
  amount?: unknown;
  status?: unknown;
}

export interface XenditWebhookPayload {
  id?: unknown;
  event?: unknown;
  data?: XenditWebhookData;
}

export type WebhookOutcome =
  | { result: "applied"; paymentStatus: PaymentStatus }
  | { result: "duplicate" }
  | { result: "ignored"; reason: "unknown_event" }
  | { result: "rejected"; code: WebhookRejectCode; status: 400 | 401 | 404 | 409 };

export type WebhookRejectCode =
  | "invalid_callback_token"
  | "invalid_payload"
  | "unknown_reference"
  | "unknown_payment_session"
  | "amount_mismatch";

const EVENT_STATUS: Record<string, PaymentStatus> = {
  "payment.succeeded": "succeeded",
  "payment.failed": "failed",
  "payment.expired": "expired",
  "payment.cancelled": "cancelled",
  "payment.refunded": "refunded",
};

const PROVIDER: PaymentProviderKind = "xendit";

/**
 * Xendit payment-session webhook processing.
 * Order: token -> shape -> event -> reference -> session -> amount ->
 * idempotent event insert -> state transition. A payment is NEVER marked
 * paid from a browser redirect — only this path (or the explicit provider
 * poll) may transition it.
 */
export async function processPaymentWebhook(
  input: { callbackToken: string | null; expectedToken: string; payload: unknown },
  deps: PaymentTransitionDeps,
): Promise<WebhookOutcome> {
  if (!input.callbackToken || !tokensMatch(input.callbackToken, input.expectedToken)) {
    return { result: "rejected", code: "invalid_callback_token", status: 401 };
  }

  const payload = (input.payload ?? {}) as XenditWebhookPayload;
  const event = typeof payload.event === "string" ? payload.event : null;
  const data = payload.data;
  if (!data) return { result: "rejected", code: "invalid_payload", status: 400 };
  const providerSessionId = typeof data.payment_session_id === "string" ? data.payment_session_id : null;
  const referenceId = typeof data.reference_id === "string" ? data.reference_id : null;
  if (!event || !providerSessionId || !referenceId) {
    return { result: "rejected", code: "invalid_payload", status: 400 };
  }

  const paymentStatus = EVENT_STATUS[event] ?? null;
  if (!paymentStatus) return { result: "ignored", reason: "unknown_event" };

  const orderResult = await deps.orders.findByCheckoutRef(referenceId);
  if (!orderResult.ok) return { result: "rejected", code: "unknown_reference", status: 404 };
  const order = orderResult.value;
  if (!order) return { result: "rejected", code: "unknown_reference", status: 404 };

  const paymentResult = await deps.payments.findByProviderSession(PROVIDER, providerSessionId);
  if (!paymentResult.ok) return { result: "rejected", code: "unknown_payment_session", status: 404 };
  const payment = paymentResult.value;
  if (!payment || payment.orderId !== order.id) {
    return { result: "rejected", code: "unknown_payment_session", status: 404 };
  }

  const amount = typeof data.amount === "string" ? Number(data.amount) : data.amount;
  if (data.currency !== "IDR" || typeof amount !== "number" || !Number.isFinite(amount) || Math.round(amount) !== order.totalAmount) {
    await recordEvent(deps, payment.id, `${PROVIDER}:${providerSessionId}:${event}:${String(payload.id ?? "")}:mismatch`, event, "rejected_amount_mismatch");
    return { result: "rejected", code: "amount_mismatch", status: 409 };
  }

  const dedupeKey = `${PROVIDER}:${providerSessionId}:${event}:${String(payload.id ?? "")}`;
  const appended = await deps.paymentEvents.recordOnce({
    id: `pev_${deps.ids.nextId()}`,
    paymentId: payment.id,
    dedupeKey,
    event,
    outcome: "applied",
    receivedAt: deps.clock.now(),
  } satisfies PaymentEventRecord);
  if (!appended.ok || appended.value === "duplicate") return { result: "duplicate" };

  await applyPaymentStatus(deps, payment, order, paymentStatus);
  return { result: "applied", paymentStatus };
}

export function webhookError(error: WebhookRejectCode): AppError {
  const messages: Record<WebhookRejectCode, string> = {
    invalid_callback_token: "Xendit callback token verification failed.",
    invalid_payload: "Webhook payload did not match the expected payment-session shape.",
    unknown_reference: "Webhook reference_id does not match a known order.",
    unknown_payment_session: "Webhook payment_session_id does not match a known payment.",
    amount_mismatch: "Webhook amount or currency does not match the order total.",
  };
  const code = error === "invalid_callback_token" ? "unauthorized" : error === "amount_mismatch" ? "conflict" : error === "invalid_payload" ? "validation" : "not_found";
  return { code, message: messages[error], retryable: false, requestId: "webhook" };
}

export { ok, err };
