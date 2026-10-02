import {
  MAX_CART_LINE_QUANTITY,
  err,
  ok,
  orderStatusForPayment,
  paymentStatusFromProviderSession,
  productFamilies,
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
} from "../ports.js";
import { applyPaymentStatus, type PaymentTransitionDeps } from "./process-payment-webhook.js";

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
  successReturnUrl: string;
  cancelReturnUrl: string;
}

export interface CreateFirstPartyCheckoutResult {
  mode: "live";
  checkoutId: string;
  checkoutRef: string;
  redirectUrl: string;
  expiresAt: string | null;
  totalAmount: number;
  currency: "IDR";
}

export interface CheckoutStatusView {
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
  orders: OrderRepository;
  payments: PaymentRepository;
  provider: PaymentProviderPort;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Re-prices every line from the canonical domain catalog — browser-submitted
 * monetary values are never read — then creates the order and the provider
 * payment session. Order + payment records are the durable audit trail.
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

  const totalAmount = priced.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  const now = deps.clock.now();
  const orderId = `ord_${deps.ids.nextId()}`;
  const checkoutRef = `co_${deps.ids.nextId()}`;
  const expiresAt = new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();

  const session = await deps.provider.createPaymentSession({
    referenceId: checkoutRef,
    amount: totalAmount,
    currency: "IDR",
    customerEmail: input.customerEmail,
    description: `Yubie order ${checkoutRef}`,
    successReturnUrl: input.successReturnUrl,
    cancelReturnUrl: input.cancelReturnUrl,
    expiresAt,
    items: priced.map((line) => ({ referenceId: line.id, name: `${line.productName} ${line.sizeLabel}`, quantity: line.quantity, netUnitAmount: line.unitPrice })),
  });
  if (!session.ok) return session;

  const order: OrderRecord = {
    id: orderId,
    checkoutRef,
    status: "pending_payment",
    userId: input.userId ?? null,
    customerEmail: input.customerEmail,
    customerName: input.customerName ?? null,
    delivery: input.delivery ?? null,
    currency: "IDR",
    totalAmount,
    lines: priced,
    createdAt: now,
    updatedAt: now,
  };
  await deps.orders.save(order);

  const payment: PaymentRecord = {
    id: `pay_${deps.ids.nextId()}`,
    orderId,
    provider: session.value.provider,
    providerSessionId: session.value.providerSessionId,
    redirectUrl: session.value.redirectUrl,
    currency: "IDR",
    amount: totalAmount,
    status: "pending",
    expiresAt: session.value.expiresAt,
    createdAt: now,
    updatedAt: now,
  };
  await deps.payments.save(payment);

  return ok({
    mode: "live",
    checkoutId: orderId,
    checkoutRef,
    redirectUrl: session.value.redirectUrl,
    expiresAt: session.value.expiresAt,
    totalAmount,
    currency: "IDR",
  });
}

export interface GetCheckoutStatusDeps extends PaymentTransitionDeps {
  provider?: PaymentProviderPort;
}

/**
 * Reads checkout status. With `poll: true` (the success-page path), a local
 * PENDING payment is reconciled once against the provider before answering —
 * covering the browser-returns-before-webhook case. Idempotent either way.
 */
export async function getCheckoutStatus(
  checkoutId: string,
  deps: GetCheckoutStatusDeps,
  options: { poll?: boolean } = {},
): Promise<{ ok: true; value: CheckoutStatusView | null } | { ok: false; error: AppError }> {
  const orderResult = await deps.orders.findById(checkoutId);
  if (!orderResult.ok) return orderResult;
  let order = orderResult.value;
  if (!order) return ok(null);

  const paymentsResult = await deps.payments.findByOrderId(order.id);
  if (!paymentsResult.ok) return paymentsResult;
  let payments = paymentsResult.value;
  let payment = payments[0] ?? null;

  if (options.poll && payment && payment.status === "pending" && deps.provider && payment.provider !== "preview") {
    const session = await deps.provider.getPaymentSession(payment.providerSessionId);
    if (session.ok && session.value) {
      const reconciled = paymentStatusFromProviderSession(session.value.rawStatus);
      if (reconciled) {
        await applyPaymentStatus(deps, payment, order, reconciled);
        payment = { ...payment, status: reconciled, updatedAt: deps.clock.now() };
        order = { ...order, status: orderStatusForPayment(reconciled) ?? order.status };
      }
    }
  }

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
