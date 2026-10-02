import { createHash, timingSafeEqual } from "node:crypto";
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
import type { AuditRepository, Clock, IdGenerator, InventoryRepository, OrderRepository, OutboxRepository, PaymentEventRepository, PaymentRepository, TransactionManager, TransactionalRepositories } from "../ports.js";

/** Constant-time comparison for the Xendit x-callback-token. */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Applies a verified payment status to the payment + order records. Safe to
 * call twice: repeat transitions are ignored (idempotent writes). Callers must
 * invoke this inside a transaction so state, audit, outbox and any inventory
 * release commit together.
 */
export async function applyPaymentStatus(
  deps: { orders: OrderRepository; payments: PaymentRepository; paymentEvents: PaymentEventRepository; audit?: AuditRepository; outbox?: OutboxRepository; inventory?: InventoryRepository; clock: Clock; ids: IdGenerator },
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
  if (deps.audit) {
    await deps.audit.append({ action: `order.${targetOrderStatus}`, resourceType: "order", resourceId: order.id, actor: "payment-webhook", occurredAt: now });
  }
  if (deps.outbox) {
    await deps.outbox.enqueue({
      eventType: `order.${targetOrderStatus}`,
      aggregateType: "order",
      aggregateId: order.id,
      dedupeKey: `order:${targetOrderStatus}:${order.id}`,
      payloadJson: JSON.stringify({ orderId: order.id, paymentId: payment.id, paymentStatus: status }),
      availableAt: now,
    });
  }
  // A cancelled order releases its lot reservations back to sellable stock in
  // the same commit.
  if (targetOrderStatus === "cancelled" && deps.inventory) {
    await deps.inventory.releaseForOrder(order.id, `payment_${status}`, now);
  }
}

export interface XenditWebhookData {
  payment_session_id?: unknown;
  reference_id?: unknown;
  currency?: unknown;
  amount?: unknown;
  status?: unknown;
  payment_id?: unknown;
  payment_request_id?: unknown;
}

export interface XenditWebhookPayload {
  event?: unknown;
  /** Business id of the Xendit account — validated against configuration. */
  business_id?: unknown;
  /** Delivery-attempt timestamp (ISO 8601). */
  created?: unknown;
  data?: XenditWebhookData;
}

export type WebhookOutcome =
  | { result: "applied"; paymentStatus: PaymentStatus }
  | { result: "duplicate" }
  | { result: "ignored"; reason: "unknown_event" }
  | { result: "rejected"; code: WebhookRejectCode; status: 400 | 401 | 403 | 404 | 409 };

export type WebhookRejectCode =
  | "invalid_callback_token"
  | "invalid_payload"
  | "business_mismatch"
  | "unknown_reference"
  | "unknown_payment_session"
  | "amount_mismatch";

/**
 * Official payment-session webhook events (docs.xendit.co, verified 2026-10).
 * COMPLETED is the only paid transition; EXPIRED is the terminal failure for
 * an unpaid hosted-checkout session. There is no session-level "failed" event
 * — failed attempts stay retryable inside an ACTIVE session.
 */
const EVENT_STATUS: Record<string, PaymentStatus> = {
  "payment_session.completed": "succeeded",
  "payment_session.expired": "expired",
};

/** Session status each event must report (when the field is present). */
const EVENT_SESSION_STATUS: Record<string, string> = {
  "payment_session.completed": "COMPLETED",
  "payment_session.expired": "EXPIRED",
};

const PROVIDER: PaymentProviderKind = "xendit";
const INBOX_PROVIDER = "xendit_payment_session";

/** Signals a rejection from inside the transaction; rolls back every write. */
class WebhookRejection extends Error {
  constructor(readonly outcome: Extract<WebhookOutcome, { result: "rejected" }>) {
    super(outcome.code);
  }
}

export interface ProcessPaymentWebhookDeps {
  tx: TransactionManager;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Xendit payment-session webhook processing (AGENTS.md §5 inbound pattern):
 * token -> shape -> event -> business_id are verified OUTSIDE the
 * transaction; then ONE transaction does inbox insert + locks via lookups +
 * amount check + idempotent event insert + state transition + audit + outbox
 * and commits. A crash before COMMIT leaves no trace, so the provider's
 * redelivery reprocesses cleanly; a redelivery after COMMIT is a duplicate
 * with zero re-effects. A payment is NEVER marked paid from a browser
 * redirect — only this path (or the explicit provider poll) may transition it.
 */
export async function processPaymentWebhook(
  input: { callbackToken: string | null; expectedToken: string; expectedBusinessId: string | null; payload: unknown },
  deps: ProcessPaymentWebhookDeps,
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

  // ADR-012 §5: the delivery must come from OUR Xendit business. A webhook
  // with the correct callback token but a foreign business_id is rejected.
  const businessId = typeof payload.business_id === "string" ? payload.business_id : null;
  if (!input.expectedBusinessId || !businessId || businessId !== input.expectedBusinessId) {
    return { result: "rejected", code: "business_mismatch", status: 403 };
  }

  const paymentStatus = EVENT_STATUS[event] ?? null;
  if (!paymentStatus) return { result: "ignored", reason: "unknown_event" };

  // When the session status is present it must agree with the event name.
  const expectedSessionStatus = EVENT_SESSION_STATUS[event];
  if (typeof data.status === "string" && data.status !== expectedSessionStatus) {
    return { result: "rejected", code: "invalid_payload", status: 400 };
  }

  const deliveryId = `${providerSessionId}:${event}:${deliveryIdentity(payload)}`;
  const payloadHash = createHash("sha256").update(JSON.stringify(input.payload ?? {})).digest("hex");

  try {
    return await deps.tx.run("payment.webhook", async (repos: TransactionalRepositories) => {
      const orderResult = await repos.orders.findByCheckoutRef(referenceId);
      if (!orderResult.ok || !orderResult.value) throw new WebhookRejection({ result: "rejected", code: "unknown_reference", status: 404 });
      const order = orderResult.value;

      const paymentResult = await repos.payments.findByProviderSession(PROVIDER, providerSessionId);
      if (!paymentResult.ok || !paymentResult.value || paymentResult.value.orderId !== order.id) {
        throw new WebhookRejection({ result: "rejected", code: "unknown_payment_session", status: 404 });
      }
      const payment = paymentResult.value;

      const amount = typeof data.amount === "string" ? Number(data.amount) : data.amount;
      if (data.currency !== "IDR" || typeof amount !== "number" || !Number.isFinite(amount) || Math.round(amount) !== order.totalAmount) {
        throw new WebhookRejection({ result: "rejected", code: "amount_mismatch", status: 409 });
      }

      // Durable inbox + effect dedupe, written only once every check has
      // passed so a rejected delivery leaves no row (the transaction would
      // roll it back anyway; this keeps the in-memory manager consistent).
      const inboxAppend = await repos.inbox.recordProcessed({
        provider: INBOX_PROVIDER,
        deliveryId,
        payloadHash,
        eventType: event,
        receivedAt: deps.clock.now(),
      });
      if (!inboxAppend.ok || inboxAppend.value === "duplicate") return { result: "duplicate" } as WebhookOutcome;

      const appended = await repos.paymentEvents.recordOnce({
        id: `pev_${deps.ids.nextId()}`,
        paymentId: payment.id,
        dedupeKey: `${PROVIDER}:${providerSessionId}:${event}:${deliveryIdentity(payload)}`,
        event,
        outcome: "applied",
        receivedAt: deps.clock.now(),
      } satisfies PaymentEventRecord);
      if (!appended.ok || appended.value === "duplicate") return { result: "duplicate" } as WebhookOutcome;

      await applyPaymentStatus({ ...repos, clock: deps.clock, ids: deps.ids }, payment, order, paymentStatus);
      return { result: "applied", paymentStatus } as WebhookOutcome;
    });
  } catch (error) {
    if (error instanceof WebhookRejection) return error.outcome;
    throw error;
  }
}

/**
 * Official payment-session webhooks carry no top-level delivery id. Redelivery
 * identity is the captured payment id when present, else the delivery-attempt
 * timestamp Xendit stamps on each send.
 */
function deliveryIdentity(payload: XenditWebhookPayload): string {
  const paymentId = payload.data?.payment_id;
  if (typeof paymentId === "string" && paymentId !== "") return paymentId;
  if (typeof payload.created === "string") return payload.created;
  return "";
}

export function webhookError(error: WebhookRejectCode): AppError {
  const messages: Record<WebhookRejectCode, string> = {
    invalid_callback_token: "Xendit callback token verification failed.",
    invalid_payload: "Webhook payload did not match the expected payment-session shape.",
    business_mismatch: "Webhook business_id does not match the configured Xendit business.",
    unknown_reference: "Webhook reference_id does not match a known order.",
    unknown_payment_session: "Webhook payment_session_id does not match a known payment.",
    amount_mismatch: "Webhook amount or currency does not match the order total.",
  };
  const code = error === "invalid_callback_token" ? "unauthorized" : error === "business_mismatch" ? "forbidden" : error === "amount_mismatch" ? "conflict" : error === "invalid_payload" ? "validation" : "not_found";
  return { code, message: messages[error], retryable: false, requestId: "webhook" };
}

export { ok, err };
