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

/**
 * Typed idempotent outcome stored on the claim. A replay MUST return the same
 * semantic result as the first attempt — including failures — so a stored
 * failure can never be deserialized into a fake success.
 */
export type StoredCheckoutOutcome =
  | { kind: "success"; result: CreateFirstPartyCheckoutResult }
  | { kind: "failure"; error: { code: string; message: string; retryable: boolean } };

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
 *        (provider_session_id NULL) + lot reservation + audit + outbox
 *        → COMMIT (the claim rolls back with the draft on failure, so a key
 *        is never poisoned by an attempt that created no order)
 *   provider.createPaymentSession (OUTSIDE any transaction)
 *     - definitive provider rejection (validation): cancel draft, release
 *       reservations, attach the typed failure outcome — nobody was charged
 *     - ambiguous outcome (timeout/unreachable/5xx): the session MIGHT exist;
 *       flag the intent "ambiguous_create" for reconciliation, attach nothing,
 *       never blind-retry
 *   TX2: attach session, order → pending_payment, audit + outbox,
 *        typed idempotent outcome → COMMIT
 *     - TX2 failure: best-effort persist the session id onto the intent
 *       (reconciliation_state "attach_failed"), then best-effort
 *       provider.cancelPaymentSession OUTSIDE any transaction. The session id
 *       is never lost, and a webhook for it matches the payment row.
 *
 * The same checkoutRef is never sent to the provider twice: retries after a
 * DEFINITIVE failure rotate to a new Idempotency-Key (new order); ambiguous
 * attempts are resolved by reconciliation or a late webhook, which can attach
 * an unknown session id by reference.
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
      return err({ code: "out_of_stock", message: `Line unavailable: ${line.productId}/${line.sizeId}`, retryable: false, requestId: "checkout" });
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

  const idempotencyKey = input.idempotencyKey ?? null;
  const claimInput = {
    scope: IDEMPOTENCY_SCOPE,
    principalKey: input.idempotencyPrincipal,
    operation: IDEMPOTENCY_OPERATION,
    idempotencyKey: idempotencyKey ?? "",
  };
  const attachOutcome = (repos: TransactionalRepositories, outcome: StoredCheckoutOutcome) =>
    repos.idempotency.attachResponse(claimInput, JSON.stringify(outcome));

  /** Replay semantics for a duplicate claim encountered inside TX1. */
  const replayStored = (stored: string | null) => {
    if (!stored) {
      return err({ code: "conflict", message: "This checkout attempt is still being resolved; retry with the same key shortly or start a new checkout.", retryable: false, requestId: "checkout" });
    }
    try {
      const parsed = JSON.parse(stored) as StoredCheckoutOutcome;
      if (parsed && parsed.kind === "success") return ok(parsed.result);
      if (parsed && parsed.kind === "failure") {
        const code = parsed.error.code === "validation" ? "validation" : "unavailable";
        return err({ code, message: parsed.error.message, retryable: parsed.error.retryable, requestId: "checkout" });
      }
    } catch {
      // fall through to the unreadable-response conflict
    }
    return err({ code: "conflict", message: "Stored idempotent response unreadable; use a new Idempotency-Key.", retryable: false, requestId: "checkout" });
  };

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
  const paymentIntent: PaymentRecord = {
    id: `pay_${deps.ids.nextId()}`,
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
  };

  // TX1: idempotency claim + durable draft + intent + lot reservation, all in
  // ONE transaction. COMMIT before any external call. A failure (inventory
  // shortfall, DB error) rolls the claim back with the draft — the key is
  // never poisoned by an attempt that created no order.
  let claimed = false;
  try {
    const tx1 = await deps.tx.run("checkout.draft", async (repos) => {
      if (idempotencyKey) {
        const claim = await repos.idempotency.claim({ ...claimInput, requestHash: requestHashOf(input.rawRequestBody), createdAt: now });
        if (!claim.ok) return claim;
        if (claim.value.status === "duplicate") return replayStored(claim.value.responseJson);
        claimed = true;
      }
      await repos.orders.save(draftOrder);
      await repos.payments.save(paymentIntent);
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
      return null;
    });
    if (tx1 !== null) return tx1; // duplicate replay outcome
  } catch (error) {
    if (error instanceof InsufficientInventoryError) {
      // PostgreSQL rolled the whole transaction back (claim included). The
      // in-memory manager cannot roll back, so release the claim explicitly
      // for parity: a retry after restock with the SAME key must succeed.
      if (claimed && idempotencyKey) {
        await deps.tx.run("checkout.idempotency.release", async (repos) => repos.idempotency.releaseClaim(claimInput)).catch(() => undefined);
      }
      return err({ code: "out_of_stock", message: `Insufficient sellable inventory for ${error.productId}/${error.sizeId}.`, retryable: false, requestId: "checkout" });
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
    const definitive = session.error.code === "validation";
    if (definitive) {
      // The provider refused the create — no payment link exists, so nobody
      // can be charged. Cancel the draft, RELEASE the reservations in the
      // same transaction, and attach the typed failure outcome so replays
      // return the same failure instead of a fake success.
      const failure: StoredCheckoutOutcome = {
        kind: "failure",
        error: { code: "validation", message: "Payment provider rejected the checkout request.", retryable: false },
      };
      await deps.tx.run("checkout.provider_failed", async (repos) => {
        await repos.orders.save({ ...draftOrder, status: "cancelled", updatedAt: deps.clock.now() });
        await repos.payments.save({ ...paymentIntent, status: "failed", reconciliationState: "provider_create_failed", updatedAt: deps.clock.now() });
        await repos.inventory.releaseForOrder(orderId, "provider_create_failed", deps.clock.now());
        await repos.audit.append({ action: "order.provider_create_failed", resourceType: "order", resourceId: orderId, actor: "checkout", occurredAt: deps.clock.now() });
        if (idempotencyKey) await attachOutcome(repos, failure);
      });
      return err({ code: "validation", message: "Payment provider rejected the checkout request; nothing was charged. Retry with a new Idempotency-Key.", retryable: false, requestId: "checkout" });
    }

    // AMBIGUOUS create (timeout / unreachable / 5xx): a session may exist at
    // the provider under this checkoutRef, but no link was delivered to the
    // browser. Never blind-retry the create; flag the intent for
    // reconciliation and answer retryable-unavailable. A late webhook for the
    // orphan session can still land: it attaches by reference.
    await deps.tx.run("checkout.provider_ambiguous", async (repos) => {
      await repos.payments.save({ ...paymentIntent, reconciliationState: "ambiguous_create", updatedAt: deps.clock.now() });
      await repos.audit.append({ action: "order.provider_create_ambiguous", resourceType: "order", resourceId: orderId, actor: "checkout", occurredAt: deps.clock.now() });
    });
    return err({
      code: session.error.code === "timeout" ? "timeout" : "unavailable",
      message: "Payment provider outcome unknown; the attempt is flagged for reconciliation. Retry with a new Idempotency-Key to start a new checkout.",
      retryable: true,
      requestId: "checkout",
    });
  }

  // TX2: attach session, order → pending_payment, typed idempotent outcome.
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

  try {
    await deps.tx.run("checkout.attach_session", async (repos) => {
      await repos.payments.save({
        ...paymentIntent,
        providerSessionId: session.value.providerSessionId,
        redirectUrl: session.value.redirectUrl,
        expiresAt: session.value.expiresAt ?? orderExpiresAt,
        ...(session.value.providerBusinessId !== undefined ? { providerBusinessId: session.value.providerBusinessId } : {}),
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
      if (idempotencyKey) await attachOutcome(repos, { kind: "success", result });
    });
  } catch (tx2Error) {
    // The provider session EXISTS but could not be attached. Compensation,
    // in order of importance: (1) never lose the session id — persist it onto
    // the intent as "attach_failed" so a webhook can match by session; then
    // (2) best-effort cancel the session OUTSIDE any transaction so it can
    // never be paid. The order stays a recoverable draft.
    let cancelAccepted: boolean | null = null;
    try {
      await deps.tx.run("checkout.attach_failed", async (repos) => {
        await repos.payments.save({
          ...paymentIntent,
          providerSessionId: session.value.providerSessionId,
          redirectUrl: session.value.redirectUrl,
          reconciliationState: "attach_failed",
          updatedAt: deps.clock.now(),
        });
        await repos.audit.append({ action: "order.attach_failed", resourceType: "order", resourceId: orderId, actor: "checkout", occurredAt: deps.clock.now() });
      });
      // Cancel OUTSIDE any transaction; a network failure here leaves the
      // session live — reconciliation still has the persisted session id.
      const cancelled = await deps.provider.cancelPaymentSession(session.value.providerSessionId);
      cancelAccepted = cancelled.ok ? cancelled.value.accepted : null;
    } catch {
      cancelAccepted = null;
    }
    return err({
      code: "unavailable",
      message: `Checkout session attach failed (session ${session.value.providerSessionId}, cancelAccepted: ${String(cancelAccepted)}); the draft is flagged for reconciliation.`,
      retryable: true,
      requestId: "checkout",
    });
  }

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
          // Lock the payment row: the webhook may be transitioning concurrently.
          const locked = await repos.payments.lockById(payment.id);
          if (locked.ok && locked.value && locked.value.status === "pending") {
            const freshOrder = await repos.orders.findById(order.id);
            if (freshOrder.ok && freshOrder.value) {
              await applyPaymentStatus({ ...repos, clock: deps.clock, ids: deps.ids }, locked.value, freshOrder.value, reconciled);
            }
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
