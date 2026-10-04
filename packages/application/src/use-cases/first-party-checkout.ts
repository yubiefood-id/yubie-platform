import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import {
  MAX_CART_LINE_QUANTITY,
  buildOrderTotals,
  err,
  ok,
  orderStatusForPayment,
  paymentStatusFromProviderSession,
  productFamilies,
  quotePromotion,
  resolveShippingPolicy,
  type AppError,
  type OrderLineRecord,
  type OrderRecord,
  type PaymentRecord,
} from "@yubie/domain";
import type {
  Clock,
  IdGenerator,
  OrderRepository,
  PaymentProviderPort,
  PaymentRepository,
  TransactionManager,
  TransactionalRepositories,
} from "../ports.js";
import { InsufficientInventoryError } from "../ports.js";
import { applyPaymentStatus } from "./process-payment-webhook.js";

export interface CheckoutLineInput {
  productId: string;
  sizeId: string;
  quantity: number;
}

export interface CreateFirstPartyCheckoutInput {
  lines: CheckoutLineInput[];
  customerEmail: string;
  customerName?: string;
  delivery?: import("@yubie/domain").OrderDelivery;
  userId?: string | null;
  /** Base of the success return URL; the opaque checkout token is appended. */
  successReturnUrl: string;
  cancelReturnUrl: string;
  /** SHIPPING_POLICY name; resolved server-side, never client-supplied. */
  shippingPolicy?: string;
  /**
   * "lots" reserves sellable lot stock inside TX1 (food-safety sellability
   * gate); "none" is allowed only outside staging/production xendit mode.
   */
  inventoryMode?: "none" | "lots";
  /** Idempotency-Key from the client; absent for non-idempotent callers. */
  idempotencyKey?: string | null;
  /** Principal scoping the idempotency key (session user or guest marker). */
  idempotencyPrincipal: string;
  /** Canonical request for hash comparison on key replay. */
  rawRequestBody: string;
  /** Public promotion identifier. The server is always the pricing authority. */
  promoCode?: string;
}

export interface CreateFirstPartyCheckoutResult {
  mode: "live";
  checkoutToken: string;
  checkoutRef: string;
  redirectUrl: string;
  expiresAt: string | null;
  subtotalAmount: number;
  shippingAmount: number;
  totalAmount: number;
  currency: "IDR";
}

/** Minimal, PII-free view for the unauthenticated success-page poll. */
export interface PublicCheckoutStatusView {
  checkoutToken: string;
  checkoutRef: string;
  orderStatus: OrderRecord["status"];
  paymentStatus: PaymentRecord["status"] | null;
  currency: "IDR";
  totalAmount: number;
  expiresAt: string | null;
}

/** Full view for the authenticated, ownership-checked account endpoint. */
export interface AccountOrderView {
  checkoutId: string;
  checkoutRef: string;
  orderStatus: OrderRecord["status"];
  paymentStatus: PaymentRecord["status"] | null;
  currency: "IDR";
  totalAmount: number;
  lines: OrderLineRecord[];
  delivery: OrderRecord["delivery"];
  expiresAt: string | null;
  customerEmail: string;
  createdAt: string;
}

export interface CreateCheckoutDeps {
  tx: TransactionManager;
  provider: PaymentProviderPort;
  clock: Clock;
  ids: IdGenerator;
}

const IDEMPOTENCY_SCOPE = "checkout";
const IDEMPOTENCY_OPERATION = "createFirstPartyCheckout";

function checkoutPublicToken(): string {
  // 128 bits of randomness, hex — the ONLY public checkout identifier.
  return randomBytes(16).toString("hex");
}

function requestHashOf(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Crash-safe checkout saga (AGENTS.md §5): re-prices every line from the
 * canonical domain catalog — browser-submitted monetary values are never
 * read — then
 *
 *   TX1: idempotency claim + draft order + totals + payment intent
 *        (provider_session_id NULL) + audit + outbox  → COMMIT
 *   provider.createPaymentSession (OUTSIDE any transaction)
 *   TX2: attach session, order → pending_payment, audit + outbox,
 *        idempotency response → COMMIT
 *
 * Every failure boundary is recoverable: provider errors cancel the draft;
 * DB failure after the provider call leaves a draft whose link was never
 * delivered (nobody can be charged), flagged for reconciliation cleanup. The
 * same checkoutRef is never sent to the provider twice — a retry after failure
 * must use a fresh Idempotency-Key, which creates a fresh order.
 */
export async function createFirstPartyCheckout(
  input: CreateFirstPartyCheckoutInput,
  deps: CreateCheckoutDeps,
): Promise<{ ok: true; value: CreateFirstPartyCheckoutResult } | { ok: false; error: AppError }> {
  const priced: OrderLineRecord[] = [];
  for (const line of input.lines) {
    const product = productFamilies.find((item) => item.id === line.productId && item.status === "available");
    const size = product?.sizes.find((item) => item.id === line.sizeId && item.available && typeof item.price === "number");
    if (!product || !size || typeof size.price !== "number") {
      return err({ code: "conflict", message: `Line unavailable: ${line.productId}/${line.sizeId}`, retryable: false, requestId: "checkout" });
    }
    const quantity = Math.min(Math.max(Math.trunc(line.quantity) || 0, 1), MAX_CART_LINE_QUANTITY);
    priced.push({
      id: `${product.id}-${size.id}`,
      productId: product.id,
      productName: product.name,
      sizeId: size.id,
      sizeLabel: size.label,
      quantity,
      unitPrice: size.price,
    });
  }
  if (priced.length === 0) {
    return err({ code: "validation", message: "Checkout requires at least one available line.", retryable: false, requestId: "checkout" });
  }

  let shipping;
  try {
    shipping = resolveShippingPolicy(input.shippingPolicy);
  } catch (error) {
    return err({ code: "validation", message: String(error), retryable: false, requestId: "checkout" });
  }
  const subtotalAmount = priced.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const promotion = quotePromotion(input.promoCode, subtotalAmount);
  const totals = buildOrderTotals(subtotalAmount, shipping.amount, 0, promotion?.discountAmount ?? 0);

  // Idempotent replay: same key + same request returns the stored first
  // response verbatim; a different request under the same key is a conflict.
  if (input.idempotencyKey) {
    const claim = { scope: IDEMPOTENCY_SCOPE, principalKey: input.idempotencyPrincipal, operation: IDEMPOTENCY_OPERATION, idempotencyKey: input.idempotencyKey };
    const claimed = await deps.tx.run("checkout.idempotency.claim", async (repos) =>
      repos.idempotency.claim({ ...claim, requestHash: requestHashOf(input.rawRequestBody), createdAt: deps.clock.now() }),
    );
    if (!claimed.ok) return claimed;
    if (claimed.value.status === "duplicate") {
      const stored = claimed.value.responseJson;
      if (stored) {
        try {
          return ok(JSON.parse(stored) as CreateFirstPartyCheckoutResult);
        } catch {
          return err({ code: "conflict", message: "Stored idempotent response unreadable; use a new Idempotency-Key.", retryable: false, requestId: "checkout" });
        }
      }
      return err({ code: "conflict", message: "Idempotency key already used; use a new key to retry.", retryable: false, requestId: "checkout" });
    }
  }
  const idempotencyKey = input.idempotencyKey ?? null;
  const attachResponse = (repos: TransactionalRepositories, responseJson: string) =>
    repos.idempotency.attachResponse(
      { scope: IDEMPOTENCY_SCOPE, principalKey: input.idempotencyPrincipal, operation: IDEMPOTENCY_OPERATION, idempotencyKey: idempotencyKey ?? "" },
      responseJson,
    );

  const now = deps.clock.now();
  const orderId = `ord_${deps.ids.nextId()}`;
  const checkoutRef = `co_${deps.ids.nextId()}_${Date.now().toString(36)}`;
  const token = checkoutPublicToken();
  const orderExpiresAt = new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();

  const draftOrder: OrderRecord = {
    id: orderId,
    checkoutRef,
    checkoutPublicToken: token,
    status: "draft",
    userId: input.userId ?? null,
    customerEmail: input.customerEmail,
    customerName: input.customerName ?? null,
    delivery: input.delivery ?? null,
    currency: "IDR",
    totals,
    totalAmount: totals.grandTotalAmount,
    shipping: { policy: shipping.policy, amount: shipping.amount, ...(shipping.reason ? { reason: shipping.reason } : {}) },
    lines: priced,
    createdAt: now,
    updatedAt: now,
  };
  const paymentIntentId = `pay_${deps.ids.nextId()}`;

  // TX1: durable draft + intent + lot reservation. COMMIT before any
  // external call. An inventory shortfall aborts the whole transaction —
  // no order survives a failed reservation.
  try {
    await deps.tx.run("checkout.draft", async (repos) => {
      await repos.orders.save(draftOrder);
      await repos.payments.save({
        id: paymentIntentId,
        orderId,
        provider: "xendit",
        providerSessionId: null,
        redirectUrl: null,
        currency: "IDR",
        amount: totals.grandTotalAmount,
        status: "pending",
        expiresAt: orderExpiresAt,
        createdAt: now,
        updatedAt: now,
      });
      if ((input.inventoryMode ?? "none") === "lots") {
        await repos.inventory.reserveForOrder({
          orderId,
          lines: priced.map((line) => ({ productId: line.productId, sizeId: line.sizeId, quantity: line.quantity })),
          now,
          expiresAt: orderExpiresAt,
        });
      }
      await repos.audit.append({ action: "order.draft_created", resourceType: "order", resourceId: orderId, actor: "checkout", occurredAt: now });
      await repos.outbox.enqueue({
        eventType: "order.draft_created",
        aggregateType: "order",
        aggregateId: orderId,
        dedupeKey: `order:draft:${orderId}`,
        payloadJson: JSON.stringify({ orderId, checkoutRef, totalAmount: totals.grandTotalAmount }),
        availableAt: now,
      });
    });
  } catch (error) {
    if (error instanceof InsufficientInventoryError) {
      const failure = { code: "conflict", message: `Insufficient sellable inventory for ${error.productId}/${error.sizeId}.`, retryable: false, requestId: "checkout" } satisfies AppError;
      // The transaction rolled back (PostgreSQL) or wrote nothing (validated
      // before any write): no order survives a failed reservation.
      return err(failure);
    }
    throw error;
  }

  // External call — outside every transaction. The success URL carries the
  // opaque token so the return lands on a page that can verify status.
  const separator = input.successReturnUrl.includes("?") ? "&" : "?";
  const session = await deps.provider.createPaymentSession({
    referenceId: checkoutRef,
    amount: totals.grandTotalAmount,
    currency: "IDR",
    customerEmail: input.customerEmail,
    description: `Yubie order ${checkoutRef}`,
    successReturnUrl: `${input.successReturnUrl}${separator}checkout=${token}`,
    cancelReturnUrl: input.cancelReturnUrl,
    expiresAt: orderExpiresAt,
    items: priced.map((line) => ({ referenceId: line.id, name: `${line.productName} ${line.sizeLabel}`, quantity: line.quantity, netUnitAmount: line.unitPrice })),
  });

  if (!session.ok) {
    // The payment link was never delivered, so nobody can be charged; cancel
    // the draft deterministically and record the failure as the idempotent
    // response for this key.
    await deps.tx.run("checkout.provider_failed", async (repos) => {
      await repos.orders.save({ ...draftOrder, status: "cancelled", updatedAt: deps.clock.now() });
      await repos.payments.save({
        id: paymentIntentId,
        orderId,
        provider: "xendit",
        providerSessionId: null,
        redirectUrl: null,
        currency: "IDR",
        amount: totals.grandTotalAmount,
        status: "failed",
        expiresAt: orderExpiresAt,
        reconciliationState: "provider_create_failed",
        createdAt: now,
        updatedAt: deps.clock.now(),
      });
      await repos.audit.append({ action: "order.provider_create_failed", resourceType: "order", resourceId: orderId, actor: "checkout", occurredAt: deps.clock.now() });
      if (idempotencyKey) {
        await attachResponse(repos, JSON.stringify({ ok: false, error: { code: "unavailable", message: "Payment provider unavailable.", retryable: true, requestId: "checkout" } }));
      }
    });
    return err({ code: "unavailable", message: "Payment provider unavailable; the draft order was cancelled. Retry with a new Idempotency-Key.", retryable: true, requestId: "checkout" });
  }

  // TX2: attach session, order → pending_payment, store idempotent response.
  const result: CreateFirstPartyCheckoutResult = {
    mode: "live",
    checkoutToken: token,
    checkoutRef,
    redirectUrl: session.value.redirectUrl,
    expiresAt: session.value.expiresAt,
    subtotalAmount: totals.subtotalAmount,
    shippingAmount: totals.shippingAmount,
    totalAmount: totals.grandTotalAmount,
    currency: "IDR",
  };

  await deps.tx.run("checkout.attach_session", async (repos) => {
    await repos.payments.save({
      id: paymentIntentId,
      orderId,
      provider: "xendit",
      providerSessionId: session.value.providerSessionId,
      redirectUrl: session.value.redirectUrl,
      currency: "IDR",
      amount: totals.grandTotalAmount,
      status: "pending",
      expiresAt: session.value.expiresAt ?? orderExpiresAt,
      ...(session.value.providerBusinessId !== undefined ? { providerBusinessId: session.value.providerBusinessId } : {}),
      createdAt: now,
      updatedAt: deps.clock.now(),
    });
    await repos.orders.save({ ...draftOrder, status: "pending_payment", updatedAt: deps.clock.now() });
    await repos.audit.append({ action: "order.pending_payment", resourceType: "order", resourceId: orderId, actor: "checkout", occurredAt: deps.clock.now() });
    await repos.outbox.enqueue({
      eventType: "order.pending_payment",
      aggregateType: "order",
      aggregateId: orderId,
      dedupeKey: `order:pending_payment:${orderId}`,
      payloadJson: JSON.stringify({ orderId, checkoutRef, providerSessionId: session.value.providerSessionId }),
      availableAt: deps.clock.now(),
    });
    if (idempotencyKey) await attachResponse(repos, JSON.stringify(result));
  });

  return ok(result);
}

export interface GetCheckoutStatusDeps {
  tx: TransactionManager;
  orders: OrderRepository;
  payments: PaymentRepository;
  provider?: PaymentProviderPort;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Public checkout status by opaque token. With `poll: true` (the success-page
 * path) a local PENDING payment is reconciled once against the provider —
 * inside a transaction — before answering, covering the
 * browser-returns-before-webhook case. The response never contains PII.
 */
export async function getCheckoutStatus(
  checkoutToken: string,
  deps: GetCheckoutStatusDeps,
  options: { poll?: boolean } = {},
): Promise<{ ok: true; value: PublicCheckoutStatusView | null } | { ok: false; error: AppError }> {
  const orderResult = await deps.orders.findByPublicToken(checkoutToken);
  if (!orderResult.ok) return orderResult;
  const order = orderResult.value;
  if (!order) return ok(null);

  const paymentsResult = await deps.payments.findByOrderId(order.id);
  if (!paymentsResult.ok) return paymentsResult;
  const payment = paymentsResult.value[0] ?? null;

  if (options.poll && payment && payment.status === "pending" && payment.providerSessionId && deps.provider && payment.provider !== "preview") {
    const session = await deps.provider.getPaymentSession(payment.providerSessionId);
    if (session.ok && session.value) {
      const reconciled = paymentStatusFromProviderSession(session.value.rawStatus);
      if (reconciled) {
        await deps.tx.run("checkout.poll_reconcile", async (repos) => {
          const freshOrder = await repos.orders.findById(order.id);
          const freshPayments = await repos.payments.findByOrderId(order.id);
          const freshPayment = freshPayments.ok ? freshPayments.value[0] ?? null : null;
          if (freshOrder.ok && freshOrder.value && freshPayment && freshPayment.status === "pending") {
            await applyPaymentStatus({ ...repos, clock: deps.clock, ids: deps.ids }, freshPayment, freshOrder.value, reconciled);
          }
        });
        return ok(view({ ...order, status: orderStatusForPayment(reconciled) ?? order.status }, { ...payment, status: reconciled }));
      }
    }
  }

  return ok(view(order, payment));
}

function view(order: OrderRecord, payment: PaymentRecord | null): PublicCheckoutStatusView {
  return {
    checkoutToken: order.checkoutPublicToken,
    checkoutRef: order.checkoutRef,
    orderStatus: order.status,
    paymentStatus: payment?.status ?? null,
    currency: "IDR",
    totalAmount: order.totalAmount,
    expiresAt: payment?.expiresAt ?? null,
  };
}

/** Full order view for the authenticated account endpoint (no poll). */
export async function getAccountOrder(
  orderId: string,
  deps: Pick<GetCheckoutStatusDeps, "orders" | "payments">,
): Promise<{ ok: true; value: AccountOrderView | null } | { ok: false; error: AppError }> {
  const orderResult = await deps.orders.findById(orderId);
  if (!orderResult.ok) return orderResult;
  const order = orderResult.value;
  if (!order) return ok(null);
  const paymentsResult = await deps.payments.findByOrderId(order.id);
  if (!paymentsResult.ok) return paymentsResult;
  const payment = paymentsResult.value[0] ?? null;
  return ok({
    checkoutId: order.id,
    checkoutRef: order.checkoutRef,
    orderStatus: order.status,
    paymentStatus: payment?.status ?? null,
    currency: "IDR",
    totalAmount: order.totalAmount,
    lines: order.lines,
    delivery: order.delivery,
    expiresAt: payment?.expiresAt ?? null,
    customerEmail: order.customerEmail,
    createdAt: order.createdAt,
  });
}

export { orderStatusForPayment };
