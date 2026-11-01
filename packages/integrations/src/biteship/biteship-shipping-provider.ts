import { err, ok, type ShipmentStatus, type UseCaseResult } from "@yubie/domain";
import type {
  BookingAddressContact,
  BookingHandle,
  CourierRateQuery,
  CourierServiceRate,
  CreateBookingInput,
  RateItem,
  RateLocation,
  ShippingProviderPort,
  TrackingSnapshot,
} from "@yubie/application";

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface BiteshipShippingProviderOptions {
  apiKey: string;
  /** Explicit environment; only controls documentation-facing assertions, the origin is pinned either way. */
  env?: "sandbox" | "production";
  /** Must equal https://api.biteship.com; anything else throws at construction (SSRF). */
  apiBaseUrl?: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

export const BITESHIP_ORIGIN = "https://api.biteship.com";
const DEFAULT_TIMEOUT_MS = 10_000;
/** Reference-id uniqueness violation; details name the existing order (recovery path). */
const REFERENCE_CONFLICT_CODE = "40002060";

/** Provider status vocabulary -> domain shipment status. Unknown values map to null (never guess). */
const BITESHIP_STATUS_MAP: Record<string, ShipmentStatus> = {
  confirmed: "booked",
  being_picked_up: "pickup_pending",
  picked: "picked",
  in_transit: "in_transit",
  delivered: "delivered",
  cancelled: "cancelled",
  cancelled_by_admin: "cancelled",
  cancelled_by_shipper: "cancelled",
  lost: "held",
  returned: "returned",
};

export function mapBiteshipStatus(raw: string | null | undefined): ShipmentStatus | null {
  if (!raw) return null;
  return BITESHIP_STATUS_MAP[raw] ?? null;
}

/**
 * Biteship REST adapter. Every call is a single request with no automatic
 * retry: ambiguous outcomes (timeout/5xx) must be reconciled by the caller,
 * never blind-retried (ADR-014 step 7).
 */
export class BiteshipShippingProvider implements ShippingProviderPort {
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: BiteshipShippingProviderOptions) {
    const origin = (options.apiBaseUrl ?? BITESHIP_ORIGIN).replace(/\/+$/, "");
    if (origin !== BITESHIP_ORIGIN) {
      throw new Error(`Biteship adapter refuses an API origin other than ${BITESHIP_ORIGIN}`);
    }
    if (!options.apiKey) {
      throw new Error("Biteship adapter requires a server-side API key");
    }
    this.fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getRates(query: CourierRateQuery): Promise<UseCaseResult<CourierServiceRate[]>> {
    const payload = {
      ...locationKeys("origin", query.origin),
      ...locationKeys("destination", query.destination),
      ...(query.couriers ? { couriers: query.couriers } : {}),
      ...(query.insuranceAmountIdr ? { courier_insurance: query.insuranceAmountIdr } : {}),
      items: query.items.map(itemPayload),
    };
    const response = await this.request("POST", "/v1/rates/couriers", payload);
    if (!response.ok) return response.value;
    const pricing = asArray((response.value as Record<string, unknown>)?.pricing);
    const rates: CourierServiceRate[] = [];
    for (const entry of pricing) {
      if (typeof entry !== "object" || entry === null) continue;
      const row = entry as Record<string, unknown>;
      const price = numberOrNull(row.price);
      const company = stringOrNull(row.company);
      const serviceCode = stringOrNull(row.courier_service_code);
      if (price === null || !company || !serviceCode) continue;
      const serviceType = stringOrNull(row.service_type);
      const instant = serviceType?.toLowerCase() === "instant" || /(^|_)(instant|same_day)/.test(serviceCode);
      rates.push({
        courierCompany: company,
        courierName: stringOrNull(row.courier_name),
        courierServiceCode: serviceCode,
        courierServiceName: stringOrNull(row.courier_service_name),
        serviceType,
        deliveryType: instant ? "now" : "scheduled",
        availableForPickup: asArray(row.available_collection_method).includes("pickup"),
        availableForInsurance: row.available_for_insurance === true,
        availableForInstantWaybill: row.available_for_instant_waybill_id === true,
        priceIdr: price,
        shippingFeeIdr: numberOrNull(row.shipping_fee),
        insuranceFeeIdr: numberOrNull(row.insurance_fee),
        currency: stringOrNull(row.currency),
        durationDescription: stringOrNull(row.duration),
      });
    }
    return ok(rates);
  }

  async createBooking(input: CreateBookingInput): Promise<UseCaseResult<BookingHandle>> {
    if (input.deliveryType === "scheduled" && (!input.scheduledDate || !input.scheduledTime)) {
      return err({ code: "validation", message: "Scheduled Biteship bookings require a date and time window.", retryable: false, requestId: "biteship" });
    }
    const payload = {
      origin_contact_name: input.origin.contactName,
      origin_contact_phone: input.origin.contactPhone,
      origin_address: input.origin.address,
      // Pickup is the whole point (ADR-014): never let the provider default decide.
      origin_collection_method: "pickup",
      ...contactKeys("origin", input.origin),
      destination_contact_name: input.destination.contactName,
      destination_contact_phone: input.destination.contactPhone,
      destination_address: input.destination.address,
      ...contactKeys("destination", input.destination),
      courier_company: input.courierCompany,
      courier_type: input.courierType,
      delivery_type: input.deliveryType,
      ...(input.deliveryType === "scheduled" && input.scheduledDate && input.scheduledTime
        ? { delivery_date: input.scheduledDate, delivery_time: input.scheduledTime }
        : {}),
      ...(input.insuranceAmountIdr ? { courier_insurance: input.insuranceAmountIdr } : {}),
      reference_id: input.referenceId,
      ...(input.note ? { order_note: input.note } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      items: input.items.map(itemPayload),
    };
    const response = await this.request("POST", "/v1/orders", payload);
    if (!response.ok) {
      // Duplicate reference: the provider already holds a booking under this
      // exact reference. Surface it as a recovered handle, not a failure.
      const conflict = response.conflictDetails;
      if (conflict && response.code === REFERENCE_CONFLICT_CODE) {
        return ok({
          provider: "biteship",
          providerOrderId: conflict.orderId,
          referenceId: input.referenceId,
          rawStatus: "reference_conflict",
          priceIdr: null,
          currency: null,
          waybillId: conflict.waybillId,
          trackingId: null,
          trackingUrl: null,
          courierCompany: null,
          courierType: null,
          recoveredViaReferenceConflict: true,
        });
      }
      return response.value;
    }
    return ok(orderHandle(response.value as Record<string, unknown>));
  }

  async getOrder(providerOrderId: string): Promise<UseCaseResult<BookingHandle | null>> {
    const response = await this.request("GET", `/v1/orders/${encodeURIComponent(providerOrderId)}`);
    if (!response.ok) return response.value;
    const handle = orderHandle(response.value as Record<string, unknown>);
    return handle.providerOrderId ? ok(handle) : ok(null);
  }

  async cancelOrder(providerOrderId: string, reason?: string): Promise<UseCaseResult<{ accepted: boolean }>> {
    // Cancellation reason codes are provider-managed; without a verified code
    // we omit it and let the sandbox/activation step pin the exact value.
    const response = await this.request("POST", `/v1/orders/${encodeURIComponent(providerOrderId)}/cancel`, reason ? { reason } : {});
    if (!response.ok) return response.value;
    return ok({ accepted: true });
  }

  async getTracking(courier: string, waybillId: string): Promise<UseCaseResult<TrackingSnapshot | null>> {
    const response = await this.request("GET", `/v1/trackings/${encodeURIComponent(courier)}/${encodeURIComponent(waybillId)}`);
    if (!response.ok) return response.value;
    const body = response.value as Record<string, unknown>;
    const history = asArray(body.history).flatMap((entry): Array<{ status: string; note?: string; city?: string; occurredAt?: string }> => {
      if (typeof entry !== "object" || entry === null) return [];
      const row = entry as Record<string, unknown>;
      const status = stringOrNull(row.status);
      if (!status) return [];
      const note = stringOrNull(row.note);
      const city = stringOrNull(row.city);
      const occurredAt = stringOrNull(row.updated_at);
      return [{ status, ...(note ? { note } : {}), ...(city ? { city } : {}), ...(occurredAt ? { occurredAt } : {}) }];
    });
    if (history.length === 0 && !stringOrNull(body.waybill_id)) return ok(null);
    return ok({ courier, waybillId: stringOrNull(body.waybill_id) ?? waybillId, history });
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    payload?: unknown,
  ): Promise<
    | { ok: true; value: unknown }
    | { ok: false; value: UseCaseResult<never>; code?: string; conflictDetails?: { orderId: string; waybillId: string | null } }
  > {
    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await this.fetchFn(`${BITESHIP_ORIGIN}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
          accept: "application/json",
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        value: err({ code: timedOut ? "timeout" : "unavailable", message: "Biteship request outcome is unknown.", retryable: true, requestId: "biteship" }),
      };
    }
    if (response.status >= 500 || response.status === 408 || response.status === 409 || response.status === 429) {
      return {
        ok: false,
        value: err({ code: response.status === 408 ? "timeout" : "unavailable", message: "Biteship request outcome is unknown.", retryable: true, requestId: "biteship" }),
      };
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return {
        ok: false,
        value: err({ code: "unavailable", message: "Biteship response was not readable.", retryable: true, requestId: "biteship" }),
      };
    }
    if (!response.ok) {
      const errorBody = (parsed as Record<string, unknown>)?.error;
      const errorRecord = typeof errorBody === "object" && errorBody !== null ? (errorBody as Record<string, unknown>) : {};
      const code = stringOrNull(errorRecord.code);
      const details = typeof errorRecord.details === "object" && errorRecord.details !== null ? (errorRecord.details as Record<string, unknown>) : {};
      const conflictOrderId = stringOrNull(details.order_id);
      return {
        ok: false,
        ...(code ? { code } : {}),
        ...(conflictOrderId ? { conflictDetails: { orderId: conflictOrderId, waybillId: stringOrNull(details.waybill_id) } } : {}),
        value: err({ code: "validation", message: "Biteship refused the request.", retryable: false, requestId: "biteship" }),
      };
    }
    return { ok: true, value: parsed };
  }
}

function orderHandle(body: Record<string, unknown>): BookingHandle {
  const courier = (typeof body.courier === "object" && body.courier !== null ? body.courier : {}) as Record<string, unknown>;
  return {
    provider: "biteship",
    providerOrderId: stringOrNull(body.id) ?? "",
    referenceId: stringOrNull(body.reference_id),
    rawStatus: stringOrNull(body.status),
    priceIdr: numberOrNull(body.price),
    currency: stringOrNull(body.currency),
    waybillId: stringOrNull(courier.waybill_id),
    trackingId: stringOrNull(courier.tracking_id),
    trackingUrl: stringOrNull(courier.link),
    courierCompany: stringOrNull(courier.company),
    courierType: stringOrNull(courier.type),
  };
}

function itemPayload(item: RateItem): Record<string, unknown> {
  return {
    name: item.name,
    category: item.category,
    ...(item.sku ? { sku: item.sku } : {}),
    value: item.valueIdr,
    quantity: item.quantity,
    weight: item.weightGrams,
    ...(item.lengthCm ? { length: item.lengthCm } : {}),
    ...(item.widthCm ? { width: item.widthCm } : {}),
    ...(item.heightCm ? { height: item.heightCm } : {}),
  };
}

function locationKeys(prefix: "origin" | "destination", location: RateLocation): Record<string, unknown> {
  if ("postalCode" in location) {
    return { [`${prefix}_postal_code`]: location.postalCode };
  }
  if ("areaId" in location) {
    return { [`${prefix}_area_id`]: location.areaId };
  }
  return { [`${prefix}_latitude`]: location.latitude, [`${prefix}_longitude`]: location.longitude };
}

function contactKeys(prefix: "origin" | "destination", contact: BookingAddressContact): Record<string, unknown> {
  return {
    ...(contact.email ? { [`${prefix}_contact_email`]: contact.email } : {}),
    ...(contact.note ? { [`${prefix}_note`]: contact.note } : {}),
    ...(contact.postalCode ? { [`${prefix}_postal_code`]: contact.postalCode } : {}),
    ...(contact.latitude !== null && contact.latitude !== undefined && contact.longitude !== null && contact.longitude !== undefined
      ? { [`${prefix}_coordinate`]: { latitude: contact.latitude, longitude: contact.longitude } }
      : {}),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
