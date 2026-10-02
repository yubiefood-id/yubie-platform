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

export interface OrderRecord {
  id: string;
  /** Xendit reference_id (<=64 chars); the public checkout identifier. */
  checkoutRef: string;
  status: FirstPartyOrderStatus;
  userId: string | null;
  customerEmail: string;
  customerName: string | null;
  delivery: OrderDelivery | null;
  currency: "IDR";
  totalAmount: number;
  lines: OrderLineRecord[];
  createdAt: string;
  updatedAt: string;
}

export type PaymentProviderKind = "xendit" | "preview";

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: PaymentProviderKind;
  providerSessionId: string;
  redirectUrl: string | null;
  currency: "IDR";
  amount: number;
  status: PaymentStatus;
  expiresAt: string | null;
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
  draft: ["pending_payment", "cancelled"],
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
    case "VOIDED":
      return "cancelled";
    default:
      return null;
  }
}
