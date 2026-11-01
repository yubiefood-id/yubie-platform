/**
 * Shipping execution domain (ADR-014). A Shipment is the physical fulfilment
 * of a paid order: provider-neutral, owned by Yubie, and never a payment or
 * inventory authority. Courier provider enums are translated inside the
 * integration adapter and never reach these types.
 *
 * Booking a courier is not shipping: only a confirmed physical pickup
 * (`picked`) authorizes the order-level `shipped` transition.
 */

export type ShipmentStatus =
  | "not_ready"       // paid + eligible; waiting for staff packing/QC
  | "ready"           // packed with weight/dims; awaiting worker dispatch lease
  | "booking_pending" // worker leased the shipment; provider call window
  | "booking_unknown" // provider outcome unknown; frozen pending reconciliation
  | "booked"          // provider accepted; courier assigned (NOT physical possession)
  | "pickup_pending"  // accepted and scheduled; courier not yet arrived
  | "picked"          // courier physically collected the package
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "failed"          // definitive booking/transport failure; retry = new generation
  | "returned"
  | "held";           // manual hold (exception, dispute, lost-package review)

/** Legal shipment transitions; anything else is a bug or replay. */
const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  not_ready: ["ready", "cancelled", "held"],
  ready: ["booking_pending", "cancelled", "held"],
  booking_pending: ["booked", "booking_unknown", "failed"],
  booking_unknown: ["booked", "failed", "cancelled"],
  booked: ["pickup_pending", "picked", "cancelled", "failed", "held"],
  pickup_pending: ["picked", "cancelled", "failed", "held"],
  picked: ["in_transit", "delivered", "returned", "failed", "held"],
  in_transit: ["delivered", "returned", "failed", "held"],
  delivered: ["returned"],
  cancelled: [],
  failed: ["ready"], // operator-approved retry with a new dispatch generation
  returned: [],
  held: ["ready", "cancelled", "failed"],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!canTransitionShipment(from, to)) {
    throw new Error(`Invalid shipment transition ${from} -> ${to}`);
  }
}

/** Terminal-for-booking states; a shipment here needs no further dispatch work. */
export const SHIPMENT_TERMINAL_STATUSES: readonly ShipmentStatus[] = ["delivered", "cancelled", "returned"];

/**
 * Physical progression rank used to drop out-of-order provider events.
 * `booked`/`pickup_pending` deliberately rank below `picked`: acceptance by a
 * courier can never satisfy physical handover.
 */
const SHIPMENT_PROGRESSION_RANK: Record<string, number> = {
  booked: 1,
  pickup_pending: 2,
  picked: 3,
  in_transit: 4,
  delivered: 5,
};

export function shipmentProgressionRank(status: ShipmentStatus): number {
  return SHIPMENT_PROGRESSION_RANK[status] ?? 0;
}

/**
 * Whether a provider-observed forward status may overwrite the stored one.
 * Same-rank repeats are refused too: replays must be deduplicated by the
 * inbox, not re-applied.
 */
export function canApplyProviderShipmentStatus(current: ShipmentStatus, observed: ShipmentStatus): boolean {
  const currentRank = shipmentProgressionRank(current);
  const observedRank = shipmentProgressionRank(observed);
  if (currentRank === 0 || observedRank === 0) return false;
  return observedRank > currentRank;
}

/**
 * Deterministic provider booking reference: stable per
 * (checkoutRef, package, generation) so a retried/ambiguous create is
 * rejected by the provider as a duplicate instead of double-booking
 * (Biteship reference_id uniqueness, error 40002060). Max 64 chars.
 */
export function buildShipmentReferenceId(checkoutRef: string, packageIndex: number, generation: number): string {
  if (!checkoutRef || checkoutRef.trim().length === 0) throw new Error("Shipment reference requires a non-empty checkout reference");
  if (!Number.isSafeInteger(packageIndex) || packageIndex < 0) throw new Error("Shipment package index must be a non-negative integer");
  if (!Number.isSafeInteger(generation) || generation <= 0) throw new Error("Shipment generation must be a positive integer");
  const ref = `ybshp-${checkoutRef.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}-p${packageIndex}-g${generation}`;
  if (ref.length > 64) throw new Error("Shipment reference exceeds provider limit");
  return ref;
}

export type ShipmentDispatchIntentState = "pending" | "leased" | "dispatched" | "unknown" | "complete" | "dead";
export type ShippingQuoteStatus = "quoted" | "consumed" | "expired";
export type ShipmentFinanceEventKind =
  | "quote_captured"
  | "customer_charged"
  | "provider_booked"
  | "price_adjustment"
  | "carrier_surcharge"
  | "insurance"
  | "merchant_subsidy"
  | "tax_recorded"
  | "refund_linked"
  | "fee";

export interface ShippingOriginRecord {
  id: string;
  label: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  /** Full pickup address; private, never exposed to customers or browsers. */
  address: string;
  postalCode: string | null;
  /** Required together for instant couriers. */
  latitude: number | null;
  longitude: number | null;
  pickupHours: string | null;
  note: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type SkuStorageClass = "shelf_stable" | "chilled" | "frozen";

export interface SkuShippingProfileRecord {
  id: string;
  /** Physical SKU exactly as inventoried (multipacks expand to components first). */
  sku: string;
  weightGrams: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  packaging: string | null;
  storageClass: SkuStorageClass;
  handlingNotes: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
  createdAt: string;
}

export interface ShippingQuoteRecord {
  id: string;
  principalKey: string;
  cartHash: string;
  destinationHash: string;
  originId: string;
  parcelsDigest: string;
  courierCompany: string;
  courierServiceCode: string;
  courierServiceName: string | null;
  serviceType: string | null;
  deliveryType: "now" | "scheduled";
  offeredAmountIdr: number;
  providerAmountIdr: number;
  subsidyAmountIdr: number;
  taxAmountIdr: number;
  taxPolicyVersion: string;
  currency: "IDR";
  status: ShippingQuoteStatus;
  validUntil: string;
  createdAt: string;
  consumedAt: string | null;
  orderId: string | null;
}

export interface ShipmentRecord {
  id: string;
  orderId: string;
  packageIndex: number;
  dispatchGeneration: number;
  referenceId: string;
  provider: "biteship";
  providerOrderId: string | null;
  status: ShipmentStatus;
  courierCompany: string | null;
  courierService: string | null;
  courierType: string | null;
  deliveryType: "now" | "scheduled" | null;
  waybillId: string | null;
  trackingId: string | null;
  trackingUrl: string | null;
  quoteId: string | null;
  quotedAmountIdr: number | null;
  actualAmountIdr: number | null;
  currency: "IDR";
  weightGrams: number | null;
  latestProviderStatus: string | null;
  lastProviderEventAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentItemRecord {
  id: string;
  shipmentId: string;
  sku: string;
  name: string;
  quantity: number;
  orderLineId: string | null;
  lotRefs: string[];
}

/**
 * Shipping tax is effective-dated policy, never a hardcoded VAT rate
 * (ADR-014: no invented 11%/12%). Non-PKP sellers present no tax line; PKP
 * presentation mode and rate come from an owner-and-accountant-approved
 * record at checkout time.
 */
export interface ShippingTaxPolicy {
  version: string;
  pkpStatus: "non_pkp" | "pkp";
  /** "zero": no tax line. "exclusive": added on top. "inclusive": already inside the shipping amount. */
  mode: "zero" | "exclusive" | "inclusive";
  /** Approved rate in basis points; required for pkp exclusive policies. */
  rateBps: number | null;
  effectiveFrom: string;
  approvedBy?: string | undefined;
}

export const DEFAULT_NON_PKP_SHIPPING_TAX_POLICY: ShippingTaxPolicy = {
  version: "non-pkp-v1",
  pkpStatus: "non_pkp",
  mode: "zero",
  rateBps: null,
  effectiveFrom: "2026-11-01",
};

export function resolveShippingTax(shippingAmountIdr: number, policy: ShippingTaxPolicy): { amountIdr: number; policyVersion: string } {
  if (!Number.isSafeInteger(shippingAmountIdr) || shippingAmountIdr < 0) {
    throw new Error("Shipping amount must be a non-negative integer");
  }
  if (policy.pkpStatus === "non_pkp" && policy.mode !== "zero") {
    throw new Error("A non-PKP shipping policy must not present any tax line");
  }
  if (policy.mode === "zero" || policy.mode === "inclusive") {
    return { amountIdr: 0, policyVersion: policy.version };
  }
  const rate = policy.rateBps;
  if (rate === null || !Number.isSafeInteger(rate) || rate <= 0 || rate > 10000) {
    throw new Error("PKP exclusive shipping tax requires an approved rate in (0, 10000] basis points");
  }
  // Single definition of rounding for the whole system.
  return { amountIdr: Math.round((shippingAmountIdr * rate) / 10000), policyVersion: policy.version };
}
