/**
 * First-party commerce records (ADR-012 / Xendit). These are additive to the
 * legacy preview Order/Cart types: they model persisted order + payment state
 * where the server is the only monetary authority.
 */

export type FirstPartyOrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "expired" | "cancelled" | "refunded";

export interface OrderLineRecord {
  id: string;
  productId: string;
  productName: string;
  sizeId: string;
  sizeLabel: string;
  quantity: number;
  /** Snapshot of the unit price at purchase time; server-derived only. */
  unitPrice: number;
}

export interface OrderDelivery {
  name?: string | undefined;
  phone: string;
  address: string;
  city: string;
  postalCode?: string | undefined;
  notes?: string | undefined;
}

/** Shipping policy snapshot stored on the order at purchase time. */
export interface OrderShipping {
  policy: "free_promotional";
  amount: number;
  reason?: string | undefined;
}

export interface OrderTotals {
  subtotalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  taxAmount: number;
  grandTotalAmount: number;
}

export interface OrderRecord {
  id: string;
  /** Xendit reference_id (<=64 chars). */
  checkoutRef: string;
  /** Opaque >=128-bit token: the ONLY public checkout identifier. */
  checkoutPublicToken: string;
  status: FirstPartyOrderStatus;
  userId: string | null;
  customerEmail: string;
  customerName: string | null;
  delivery: OrderDelivery | null;
  currency: "IDR";
  totals: OrderTotals;
  /** Legacy single total == grandTotalAmount; kept for compatible consumers. */
  totalAmount: number;
  shipping: OrderShipping | null;
  lines: OrderLineRecord[];
  createdAt: string;
  updatedAt: string;
}

export type PaymentProviderKind = "xendit" | "preview";

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: PaymentProviderKind;
  /** Null until the provider session is attached (payment-intent phase). */
  providerSessionId: string | null;
  redirectUrl: string | null;
  currency: "IDR";
  amount: number;
  status: PaymentStatus;
  expiresAt: string | null;
  providerBusinessId?: string | null;
  providerPaymentId?: string | null;
  /** "ambiguous" when the provider outcome is unknown and needs reconciliation. */
  reconciliationState?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentEventRecord {
  id: string;
  paymentId: string;
  /** Dedupe identity: provider session + event (+ provider event id). */
  dedupeKey: string;
  event: string;
  /** "applied" | "duplicate" | "rejected_*" */
  outcome: string;
  receivedAt: string;
}

/** Legal order-status transitions; anything else is a bug or replay. */
const ORDER_TRANSITIONS: Record<FirstPartyOrderStatus, FirstPartyOrderStatus[]> = {
  draft: ["pending_payment", "paid", "cancelled"],
  pending_payment: ["paid", "cancelled"],
  paid: ["processing"],
  processing: ["shipped"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
};

export function canTransitionOrder(from: FirstPartyOrderStatus, to: FirstPartyOrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Legal payment-status transitions. Terminal states are sticky: an
 * authoritative succeeded payment can never be overwritten by a late
 * expired/cancelled delivery, and a terminal failure never flips back. This
 * is what keeps payment and order state from contradicting each other when
 * provider events arrive out of order.
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["succeeded", "failed", "expired", "cancelled"],
  succeeded: ["refunded"],
  refunded: [],
  failed: [],
  expired: [],
  cancelled: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

/** Maps a provider payment status onto the order status it authorizes. */
export function orderStatusForPayment(payment: PaymentStatus): FirstPartyOrderStatus | null {
  switch (payment) {
    case "succeeded":
    case "refunded":
      // A succeeded payment moves a pending order to paid. Refunds keep the
      // order paid; fulfilment reversal is a separate operator flow.
      return "paid";
    case "failed":
    case "expired":
    case "cancelled":
      return "cancelled";
    case "pending":
      return null;
  }
}

/** Terminal provider-session statuses we may reconcile from a poll. */
export function paymentStatusFromProviderSession(rawStatus: string): PaymentStatus | null {
  switch (rawStatus) {
    case "SUCCEEDED":
    case "COMPLETED":
    case "PAID":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "EXPIRED":
      return "expired";
    case "CANCELLED":
    case "CANCELED":
    case "VOIDED":
      return "cancelled";
    default:
      return null;
  }
}

/**
 * Shipping policies the server may charge. Every policy is explicit: the
 * charged amount always equals the policy snapshot stored on the order — the
 * store never promises unpriced shipping. New policies must be added here (a
 * config typo is a validation error, never a silent zero).
 */
export type ShippingPolicyName = "free_promotional";

export function resolveShippingPolicy(policy: string | undefined): { policy: ShippingPolicyName; amount: number; reason: string } {
  const value = policy ?? "free_promotional";
  if (value === "free_promotional") {
    return { policy: "free_promotional", amount: 0, reason: "Promotional free shipping (time-limited, operator approved)" };
  }
  throw new Error(`Unknown SHIPPING_POLICY "${value}" — supported: free_promotional`);
}

/** Integer-IDR totals; the charged grand total is always the exact sum. */
export function buildOrderTotals(subtotalAmount: number, shippingAmount: number, taxAmount: number, discountAmount: number): OrderTotals {
  const grandTotalAmount = subtotalAmount + shippingAmount + taxAmount - discountAmount;
  return { subtotalAmount, shippingAmount, discountAmount, taxAmount, grandTotalAmount };
}
