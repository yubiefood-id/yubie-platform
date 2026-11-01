import type { UseCaseResult } from "@yubie/domain";

/**
 * Provider-neutral shipping boundary (ADR-014). Biteship specifics never
 * cross it. The port speaks in neutral courier terms; provider enums,
 * payload spellings and status vocabularies are translated inside the
 * integration adapter.
 *
 * Error contract (mirrors PaymentProviderPort):
 *  - err code "validation": the provider DEFINITIVELY refused the request
 *    (4xx other than 408/409/429). Nothing was created or charged.
 *  - err code "timeout" / "unavailable": transport failure, timeout, or a
 *    provider 5xx. The outcome is AMBIGUOUS — a booking may exist at the
 *    provider. Callers must never blind-retry createBooking; reconcile via
 *    getOrder or the reference-conflict recovery below.
 *  - err code "unsupported": the provider does not offer the operation;
 *    callers must degrade to manual/operator handling, never guess.
 *
 * createBooking reference-conflict recovery: providers that enforce unique
 * reference ids reject a re-sent create with the PREVIOUS order's identity.
 * The adapter surfaces that as ok(handle) with
 * `recoveredViaReferenceConflict: true` so the caller records the existing
 * provider order instead of booking a second shipment.
 */

export type ShippingProviderKind = "biteship";

export type ShippingItemCategory =
  | "food_and_drink"
  | "frozen_food"
  | "groceries"
  | "healthcare"
  | "others";

/** One-of location addressing; coordinates are required for instant couriers. */
export type RateLocation =
  | { postalCode: string }
  | { latitude: number; longitude: number }
  | { areaId: string };

export interface RateItem {
  name: string;
  category: ShippingItemCategory;
  sku?: string | undefined;
  /** Declared value per unit in IDR (insurance basis). */
  valueIdr: number;
  quantity: number;
  weightGrams: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

export interface CourierRateQuery {
  origin: RateLocation;
  destination: RateLocation;
  /** Provider courier filter ("company:service,company:service"); empty = all entitled. */
  couriers?: string | undefined;
  insuranceAmountIdr?: number | null;
  items: RateItem[];
}

export interface CourierServiceRate {
  courierCompany: string;
  courierName: string | null;
  courierServiceCode: string;
  courierServiceName: string | null;
  /** Provider-described service class ("instant", "same_day", "standard", ...); display only. */
  serviceType: string | null;
  /** Instant-style services dispatch "now"; everything else is scheduled-window pickup. */
  deliveryType: "now" | "scheduled" | null;
  /** Only services that support PICKUP collection can meet ADR-014 (no staff drop-off). */
  availableForPickup: boolean;
  availableForInsurance: boolean;
  availableForInstantWaybill: boolean;
  /** Final customer-facing provider price in IDR. */
  priceIdr: number;
  shippingFeeIdr: number | null;
  insuranceFeeIdr: number | null;
  currency: string | null;
  durationDescription: string | null;
}

export interface BookingAddressContact {
  contactName: string;
  contactPhone: string;
  address: string;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  email?: string | null;
  note?: string | null;
}

export interface CreateBookingInput {
  referenceId: string;
  origin: BookingAddressContact;
  destination: BookingAddressContact;
  courierCompany: string;
  courierServiceCode: string;
  courierType: string;
  deliveryType: "now" | "scheduled";
  /** YYYY-MM-DD + HH:mm; required when deliveryType is scheduled. */
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  insuranceAmountIdr?: number | null;
  items: RateItem[];
  note?: string | null;
  metadata?: Record<string, string> | null;
}

export interface BookingHandle {
  provider: ShippingProviderKind;
  providerOrderId: string;
  referenceId: string | null;
  /** Raw provider status vocabulary; never a domain ShipmentStatus. */
  rawStatus: string | null;
  priceIdr: number | null;
  currency: string | null;
  waybillId: string | null;
  trackingId: string | null;
  trackingUrl: string | null;
  courierCompany: string | null;
  courierType: string | null;
  /** True when the create was refused as a duplicate reference and the provider named the existing order. */
  recoveredViaReferenceConflict?: boolean;
}

export interface TrackingSnapshot {
  courier: string;
  waybillId: string;
  history: Array<{ status: string; note?: string | undefined; city?: string | undefined; occurredAt?: string | undefined }>;
}

export interface ShippingProviderPort {
  getRates(query: CourierRateQuery): Promise<UseCaseResult<CourierServiceRate[]>>;
  createBooking(input: CreateBookingInput): Promise<UseCaseResult<BookingHandle>>;
  getOrder(providerOrderId: string): Promise<UseCaseResult<BookingHandle | null>>;
  cancelOrder(providerOrderId: string, reason?: string): Promise<UseCaseResult<{ accepted: boolean }>>;
  getTracking(courier: string, waybillId: string): Promise<UseCaseResult<TrackingSnapshot | null>>;
}
