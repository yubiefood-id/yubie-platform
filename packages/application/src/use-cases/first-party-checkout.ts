import { randomBytes } from "node:crypto";
import {
  MAX_CART_LINE_QUANTITY,
  MAX_CHECKOUT_TOTAL_IDR,
  buildOrderTotals,
  err,
  isPayableTotal,
  ok,
  orderStatusForPayment,
  paymentStatusFromProviderSession,
  productFamilies,
  normalizePhone,
  resolveShippingPolicy,
  type AppError,
  type OrderLineRecord,
  type OrderRecord,
  type OrderTotals,
  type PaymentProviderKind,
  type PaymentRecord,
} from "@yubie/domain";
import type {
  Clock,
  CreatePaymentSessionInput,
  IdGenerator,
  OrderRepository,
  PaymentProviderPort,
  PaymentRepository,
  TransactionManager,
  TransactionalRepositories,
} from "../ports.js";
import { DuplicatePaymentIntentError, InsufficientInventoryError } from "../ports.js";
import { erpStockWriteDecision } from "../policies/erp-authority.js";
import { checkoutIntentHash, checkoutRequestHash, checkoutIntentHashV3, checkoutRequestHashV3, isCheckoutPrincipalKey } from "./checkout-intent.js";
import { applyPaymentStatus } from "./process-payment-webhook.js";
import { authorizeCheckoutPromotion, reserveCheckoutPromotion, settlePromotionForPayment, PromotionAuthorizationError } from "./verified-promotions.js";
import type { CustomerProof } from "./phone-auth.js";
import { lockCheckoutScope, CheckoutScopeError } from "./checkout-principals.js";
class CheckoutTotalError extends Error {}

export interface CheckoutLineInput {
  productId: string;
  sizeId: string;
  quantity: number;
}

export interface CreateFirstPartyCheckoutInput {
  checkoutVersion?: 3;
  lines: CheckoutLineInput[];
  customerEmail: string | null;
  customerPhone?: string | null;
  customerName?: string;
  /** Bounded non-PII API correlation id for audit evidence. */
  requestId?: string;
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
  /** `user:<id>` or `guest:<sha256 of checkout cookie>`; see checkoutPrincipalKey. */
  idempotencyPrincipal: string;
  /** Public promotion identifier. The server is always the pricing authority. */
  promoCode?: string;
  customerProof?: CustomerProof;
  /** Server-derived possession of an existing guest checkout cookie only. */
  possessedGuestPrincipal?: string;
  /** Adapter selected by commerce config. Existing callers stay on xendit. */
  provider?: PaymentProviderKind;
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
  | { kind: "failure"; error: { code: string; message: string; retryable: boolean } }
  | { kind: "pending"; message: string };

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
  customerEmail: string | null;
  customerPhone?: string | null;
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

const OPEN_INTENT_PENDING_MESSAGE = "An unresolved payment attempt already exists for this cart. A second payable session will not be created.";

type CheckoutResult = { ok: true; value: CreateFirstPartyCheckoutResult } | { ok: false; error: AppError };

function outcomeResult(outcome: StoredCheckoutOutcome): CheckoutResult {
  if (outcome.kind === "success") return ok(outcome.result);
  if (outcome.kind === "pending") {
    return err({ code: "pending_reconciliation", message: outcome.message, retryable: true, requestId: "checkout" });
  }
  if (outcome.kind === "failure") {
    const code = outcome.error.code === "validation" ? "validation" : "unavailable";
    return err({ code, message: outcome.error.message, retryable: outcome.error.retryable, requestId: "checkout" });
  }
  return err({ code: "conflict", message: "Stored idempotent response unreadable; use a new Idempotency-Key.", retryable: false, requestId: "checkout" });
}

/** The unresolved intent for this principal and cart, as a replayable outcome. */
async function openIntentOutcome(repos: TransactionalRepositories, principalKey: string, intentHash: string, principals = [principalKey]): Promise<StoredCheckoutOutcome | null> {
  const pending = await repos.payments.findUnresolvedByPrincipals(principals);
  if (!pending.ok) throw new Error("Checkout recovery storage unavailable");
  if (!pending.value.length) return null;
  if (pending.value.length !== 1 || pending.value[0]!.requestHash !== intentHash || pending.value[0]!.status !== "pending") return { kind: "pending", message: OPEN_INTENT_PENDING_MESSAGE };
  const payment = { value: pending.value[0]! };
  const order = await repos.orders.findById(payment.value.orderId);
  if (!order.ok || !order.value) throw new Error("Checkout recovery order unavailable");
  // A flagged intent (ambiguous create, attach failure, pending reconciliation)
  // may point at a cancelled or unknown session; only a clean one is reused.
  if (!payment.value.redirectUrl || payment.value.reconciliationState) return { kind: "pending", message: OPEN_INTENT_PENDING_MESSAGE };
  return {
    kind: "success",
    result: {
      mode: "live",
      checkoutToken: order.value.checkoutPublicToken,
      checkoutRef: order.value.checkoutRef,
      redirectUrl: payment.value.redirectUrl,
      expiresAt: payment.value.expiresAt,
      subtotalAmount: order.value.totals.subtotalAmount,
      shippingAmount: order.value.totals.shippingAmount,
      totalAmount: order.value.totalAmount,
      currency: "IDR",
    },
  };
}

/** Provider calls race verified callbacks: always merge into a locked fresh record. */
async function lockCheckout(repos: TransactionalRepositories, paymentId: string, orderId: string) {
  const payment = await repos.payments.lockById(paymentId);
  const order = await repos.orders.findById(orderId);
  if (!payment.ok || !payment.value || !order.ok || !order.value) throw new Error("Checkout persistence unavailable");
  return { payment: payment.value, order: order.value };
}

function confirmedOutcome(order: OrderRecord, payment: PaymentRecord, successReturnUrl: string): StoredCheckoutOutcome | null {
  if (payment.status === "pending") return null;
  if (payment.status === "succeeded" || payment.status === "refunded") {
    return { kind: "success", result: { mode: "live", checkoutToken: order.checkoutPublicToken, checkoutRef: order.checkoutRef,
      redirectUrl: `${successReturnUrl}${successReturnUrl.includes("?") ? "&" : "?"}checkout=${order.checkoutPublicToken}`,
      expiresAt: payment.expiresAt, subtotalAmount: order.totals.subtotalAmount, shippingAmount: order.totals.shippingAmount,
      totalAmount: order.totalAmount, currency: "IDR" } };
  }
  return { kind: "failure", error: { code: "validation", message: "Payment attempt is already closed. Start a new checkout.", retryable: false } };
}

/**
 * Line items sent to the payment provider. iPaymu requires the lines to sum
 * to the charged amount and has no discount or shipping field, so it gets one
 * aggregate line at the grand total. Xendit keeps per-product lines when
 * their sum matches; discounted/shipping baskets also use the final aggregate.
 */
export function buildProviderLineItems(
  provider: PaymentProviderKind | undefined,
  checkoutRef: string,
  priced: readonly OrderLineRecord[],
  totals: OrderTotals,
): CreatePaymentSessionInput["items"] {
  if (!isPayableTotal(totals.grandTotalAmount)) {
    throw new RangeError(`Grand total ${totals.grandTotalAmount} is not a payable amount`);
  }
  const lineTotal = priced.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  if (provider === "ipaymu" || lineTotal !== totals.grandTotalAmount) {
    return [{ referenceId: checkoutRef, name: `Pesanan Yubie ${checkoutRef}`, quantity: 1, netUnitAmount: totals.grandTotalAmount }];
  }
  return priced.map((line) => ({ referenceId: line.id, name: `${line.productName} ${line.sizeLabel}`, quantity: line.quantity, netUnitAmount: line.unitPrice }));
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
  if (erpStockWriteDecision().allowed) {
    return err({ code: "unsupported", message: "Checkout does not write ERP stock", retryable: false, requestId: "checkout" });
  }
  if (!isCheckoutPrincipalKey(input.idempotencyPrincipal)) {
    return err({ code: "validation", message: "Checkout requires a user or guest checkout principal.", retryable: false, requestId: "checkout" });
  }
  const phone = input.checkoutVersion === 3 ? normalizePhone(input.customerPhone ?? "") : null;
  if ((input.checkoutVersion === 3 && !phone) || (input.checkoutVersion !== 3 && !input.customerEmail)) {
    return err({ code: "validation", message: "Checkout contact is invalid.", retryable: false, requestId: "checkout" });
  }
  if (input.possessedGuestPrincipal && (!/^guest:[0-9a-f]{64}$/.test(input.possessedGuestPrincipal)
    || (input.idempotencyPrincipal !== input.possessedGuestPrincipal && input.idempotencyPrincipal !== `user:${input.userId}`))) {
    return err({ code: "validation", message: "Invalid checkout recovery principal.", retryable: false, requestId: "checkout" });
  }
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
      return err({ code: "pending_reconciliation", message: "This checkout attempt is still unresolved. Retry the same attempt; a second payable session will not be created.", retryable: true, requestId: "checkout" });
    }
    try {
      return outcomeResult(JSON.parse(stored) as StoredCheckoutOutcome);
    } catch {
      return err({ code: "conflict", message: "Stored idempotent response unreadable; use a new Idempotency-Key.", retryable: false, requestId: "checkout" });
    }
  };

  const now = deps.clock.now();
  const auditActor = input.requestId && /^[A-Za-z0-9_-]{1,64}$/.test(input.requestId)
    ? `checkout:${input.requestId}`
    : "checkout";
  const intentHash = (input.checkoutVersion === 3 ? checkoutIntentHashV3 : checkoutIntentHash)({ lines: input.lines.map(line => ({ ...line, quantity: Math.min(Math.max(Math.trunc(line.quantity) || 0, 1), MAX_CART_LINE_QUANTITY) })), promoCode: input.promoCode, delivery: input.delivery ?? null });
  const requestHash = input.checkoutVersion === 3
    ? checkoutRequestHashV3(intentHash, { phone: phone!.e164, email: input.customerEmail, name: input.customerName ?? null })
    : checkoutRequestHash(intentHash, input.customerEmail!, input.customerName);

  // Authenticate recovery scope and commit proved cookie association separately
  // from purchase eligibility. A rejected purchase must not erase that proof.
  // Recover existing attempts before today's catalog/shipping rules, then lock
  // and recheck again in TX1 before any new payable order can be created.
  let recovered: CheckoutResult | null;
  try {
    recovered = await deps.tx.run("checkout.replay", async repos => {
      const principals = await lockCheckoutScope({ principal: input.idempotencyPrincipal, ...(input.possessedGuestPrincipal ? { guest: input.possessedGuestPrincipal } : {}) }, repos, now);
      if (idempotencyKey) {
        const stored = await repos.idempotency.lookup({ ...claimInput, requestHash });
        if (!stored.ok) return stored;
        if (stored.value) return replayStored(stored.value.responseJson);
      }
      const open = await openIntentOutcome(repos, input.idempotencyPrincipal, intentHash, principals);
      if (!open) return null;
      if (idempotencyKey) {
        const claim = await repos.idempotency.claim({ ...claimInput, requestHash, createdAt: now });
        if (!claim.ok) return claim;
        if (claim.value.status === "duplicate") return replayStored(claim.value.responseJson);
        if (!(await attachOutcome(repos, open)).ok) throw new Error("Checkout recovery persistence unavailable");
      }
      return outcomeResult(open);
    });
  } catch (error) {
    if (error instanceof CheckoutScopeError) return err({ code: error.code, message: error.message, retryable: error.code === "pending_reconciliation", requestId: "checkout" });
    throw error;
  }
  if (recovered) return recovered;

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
  let totals = buildOrderTotals(subtotalAmount, shipping.amount, 0, 0);

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
    customerPhone: phone?.e164 ?? null,
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
    provider: input.provider === "ipaymu" ? "ipaymu" : "xendit",
    providerSessionId: null,
    principalKey: input.idempotencyPrincipal,
    requestHash: intentHash,
    redirectUrl: null,
    currency: "IDR",
    amount: totals.grandTotalAmount,
    status: "pending",
    reconciliationState: "create_in_flight",
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
      if (input.userId && repos.promotions) await repos.promotions.lockCustomer(input.userId);
      const checkoutPrincipals = await lockCheckoutScope({ principal: input.idempotencyPrincipal, ...(input.possessedGuestPrincipal ? { guest: input.possessedGuestPrincipal } : {}) }, repos, now);
      if (idempotencyKey) {
        const claim = await repos.idempotency.claim({ ...claimInput, requestHash, createdAt: now });
        if (!claim.ok) return claim;
        if (claim.value.status === "duplicate") return replayStored(claim.value.responseJson);
        claimed = true;
      }
      const open = await openIntentOutcome(repos, input.idempotencyPrincipal, intentHash, checkoutPrincipals);
      if (open) {
        if (idempotencyKey) await attachOutcome(repos, open);
        return outcomeResult(open);
      }
      const promotion = await authorizeCheckoutPromotion({
        lines: priced, ...(input.userId === undefined ? {} : { userId: input.userId }),
        ...(input.customerProof ? { actor: input.customerProof } : {}), ...(input.promoCode ? { code: input.promoCode } : {}),
        ...(input.possessedGuestPrincipal ? { guestPrincipal: input.possessedGuestPrincipal } : {}),
      }, repos, deps.clock.now());
      totals = buildOrderTotals(subtotalAmount, shipping.amount, 0, promotion?.quote.discountAmount ?? 0);
      if (!isPayableTotal(totals.grandTotalAmount)) throw new CheckoutTotalError();
      draftOrder.totals = totals; draftOrder.totalAmount = totals.grandTotalAmount; paymentIntent.amount = totals.grandTotalAmount;
      await repos.orders.save(draftOrder);
      await repos.payments.save(paymentIntent);
      if (promotion) await reserveCheckoutPromotion(promotion, orderId, repos, deps);
      if ((input.inventoryMode ?? "none") === "lots") {
        await repos.inventory.reserveForOrder({
          orderId,
          lines: priced.map((line) => ({ productId: line.productId, sizeId: line.sizeId, quantity: line.quantity })),
          now,
          expiresAt: orderExpiresAt,
        });
      }
      await repos.audit.append({ action: "order.draft_created", resourceType: "order", resourceId: orderId, actor: auditActor, occurredAt: now });
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
    if (error instanceof CheckoutScopeError) return err({ code: error.code, message: error.message, retryable: error.code === "pending_reconciliation", requestId: "checkout" });
    if (error instanceof PromotionAuthorizationError || error instanceof CheckoutTotalError) {
      if (claimed && idempotencyKey) await deps.tx.run("checkout.idempotency.release", repos => repos.idempotency.releaseClaim(claimInput)).catch(() => undefined);
      return error instanceof PromotionAuthorizationError ? err(error.safeError) : err({ code: "validation", message: `Order total must be between 1 and ${MAX_CHECKOUT_TOTAL_IDR} IDR for web checkout. Contact us on WhatsApp for larger orders.`, retryable: false, requestId: "checkout" });
    }
    if (error instanceof InsufficientInventoryError) {
      // PostgreSQL rolled the whole transaction back (claim included). The
      // in-memory manager cannot roll back, so release the claim explicitly
      // for parity: a retry after restock with the SAME key must succeed.
      if (claimed && idempotencyKey) {
        await deps.tx.run("checkout.idempotency.release", async (repos) => repos.idempotency.releaseClaim(claimInput)).catch(() => undefined);
      }
      return err({ code: "out_of_stock", message: `Insufficient sellable inventory for ${error.productId}/${error.sizeId}.`, retryable: false, requestId: "checkout" });
    }
    if (error instanceof DuplicatePaymentIntentError) {
      // A concurrent submit for the same principal and cart committed its
      // intent first. Answer with that intent; never create a second order.
      if (claimed && idempotencyKey) {
        await deps.tx.run("checkout.idempotency.release", async (repos) => repos.idempotency.releaseClaim(claimInput)).catch(() => undefined);
      }
      const winner = await deps.tx.run("checkout.find_open_intent", async (repos) => openIntentOutcome(repos, input.idempotencyPrincipal, intentHash));
      return outcomeResult(winner ?? { kind: "pending", message: OPEN_INTENT_PENDING_MESSAGE });
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
    customerPhone: phone?.e164 ?? null,
    description: `Yubie order ${checkoutRef}`,
    successReturnUrl: `${input.successReturnUrl}${separator}checkout=${token}`,
    cancelReturnUrl: input.cancelReturnUrl,
    expiresAt: orderExpiresAt,
    items: buildProviderLineItems(input.provider, checkoutRef, priced, totals),
  }).catch((): Awaited<ReturnType<PaymentProviderPort["createPaymentSession"]>> =>
    // A thrown adapter error says nothing about whether the provider accepted
    // the create, so it is handled as ambiguous.
    err({ code: "unavailable", message: "Payment provider call threw", retryable: true, requestId: "checkout" }));

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
      const confirmed = await deps.tx.run("checkout.provider_failed", async (repos) => {
        const fresh = await lockCheckout(repos, paymentIntent.id, orderId);
        const outcome = confirmedOutcome(fresh.order, fresh.payment, input.successReturnUrl);
        if (outcome) { if (idempotencyKey) await attachOutcome(repos, outcome); return outcome; }
        await repos.orders.save({ ...fresh.order, status: "cancelled", updatedAt: deps.clock.now() });
        await repos.payments.save({ ...fresh.payment, status: "failed", reconciliationState: "provider_create_failed", updatedAt: deps.clock.now() });
        await repos.inventory.releaseForOrder(orderId, "provider_create_failed", deps.clock.now());
        await settlePromotionForPayment(repos, orderId, "failed", deps.clock.now());
        await repos.audit.append({ action: "order.provider_create_failed", resourceType: "order", resourceId: orderId, actor: auditActor, occurredAt: deps.clock.now() });
        if (idempotencyKey) await attachOutcome(repos, failure);
        return null;
      });
      if (confirmed) return outcomeResult(confirmed);
      return err({ code: "validation", message: "Payment provider rejected the checkout request; nothing was charged. Retry with a new Idempotency-Key.", retryable: false, requestId: "checkout" });
    }

    // AMBIGUOUS create (timeout / unreachable / 5xx): a session may exist at
    // the provider under this checkoutRef, but no link was delivered to the
    // browser. Never blind-retry the create; flag the intent for
    // reconciliation and answer retryable-unavailable. A late webhook for the
    // orphan session can still land: it attaches by reference.
    const pendingMessage = "Payment provider outcome unknown. Retry this same attempt; a second payable session will not be created.";
    const confirmed = await deps.tx.run("checkout.provider_ambiguous", async (repos) => {
      const fresh = await lockCheckout(repos, paymentIntent.id, orderId);
      const outcome = confirmedOutcome(fresh.order, fresh.payment, input.successReturnUrl);
      if (outcome) { if (idempotencyKey) await attachOutcome(repos, outcome); return outcome; }
      await repos.payments.save({ ...fresh.payment, reconciliationState: "ambiguous_create", updatedAt: deps.clock.now() });
      await repos.audit.append({ action: "order.provider_create_ambiguous", resourceType: "order", resourceId: orderId, actor: auditActor, occurredAt: deps.clock.now() });
      if (idempotencyKey) await attachOutcome(repos, { kind: "pending", message: pendingMessage });
      return null;
    });
    if (confirmed) return outcomeResult(confirmed);
    return err({
      code: session.error.code === "timeout" ? "timeout" : "unavailable",
      message: pendingMessage,
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
    const confirmed = await deps.tx.run("checkout.attach_session", async (repos) => {
      const fresh = await lockCheckout(repos, paymentIntent.id, orderId);
      const outcome = confirmedOutcome(fresh.order, fresh.payment, input.successReturnUrl);
      if (outcome) { if (idempotencyKey) await attachOutcome(repos, outcome); return outcome; }
      await repos.payments.save({
        ...fresh.payment,
        providerSessionId: session.value.providerSessionId,
        reconciliationState: null,
        redirectUrl: session.value.redirectUrl,
        expiresAt: session.value.expiresAt ?? orderExpiresAt,
        ...(session.value.providerBusinessId !== undefined ? { providerBusinessId: session.value.providerBusinessId } : {}),
        updatedAt: deps.clock.now(),
      });
      await repos.orders.save({ ...fresh.order, status: "pending_payment", updatedAt: deps.clock.now() });
      await repos.audit.append({ action: "order.pending_payment", resourceType: "order", resourceId: orderId, actor: auditActor, occurredAt: deps.clock.now() });
      await repos.outbox.enqueue({
        eventType: "order.pending_payment",
        aggregateType: "order",
        aggregateId: orderId,
        dedupeKey: `order:pending_payment:${orderId}`,
        payloadJson: JSON.stringify({ orderId, checkoutRef, providerSessionId: session.value.providerSessionId }),
        availableAt: deps.clock.now(),
      });
      if (idempotencyKey) await attachOutcome(repos, { kind: "success", result });
      return null;
    });
    if (confirmed) return outcomeResult(confirmed);
  } catch (tx2Error) {
    // The provider session EXISTS but could not be attached. Compensation,
    // in order of importance: (1) never lose the session id — persist it onto
    // the intent as "attach_failed" so a webhook can match by session; then
    // (2) best-effort cancel the session OUTSIDE any transaction so it can
    // never be paid. The order stays a recoverable draft.
    let cancelAccepted: boolean | null = null;
    try {
      const confirmed = await deps.tx.run("checkout.attach_failed", async (repos) => {
        const fresh = await lockCheckout(repos, paymentIntent.id, orderId);
        const outcome = confirmedOutcome(fresh.order, fresh.payment, input.successReturnUrl);
        if (outcome) { if (idempotencyKey) await attachOutcome(repos, outcome); return outcome; }
        await repos.payments.save({
          ...fresh.payment,
          providerSessionId: session.value.providerSessionId,
          redirectUrl: session.value.redirectUrl,
          reconciliationState: "attach_failed",
          updatedAt: deps.clock.now(),
        });
        await repos.audit.append({ action: "order.attach_failed", resourceType: "order", resourceId: orderId, actor: auditActor, occurredAt: deps.clock.now() });
        return null;
      });
      if (confirmed) return outcomeResult(confirmed);
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
    customerPhone: order.customerPhone ?? null,
    createdAt: order.createdAt,
  });
}

export { orderStatusForPayment };
