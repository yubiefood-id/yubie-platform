import { timingSafeEqual } from "node:crypto";

/**
 * Biteship webhook security model (pinned 2026-11-01, see
 * docs/shipping/BITESHIP_API_NOTES.md): the merchant configures a static
 * "Headers Signature Key + Secret" pair in the dashboard; deliveries carry
 * the secret verbatim in that header. There is NO HMAC — compare
 * constant-time and never invent a signature scheme (ADR-014 step 9).
 */
export function verifyBiteshipWebhookSecret(received: string | undefined, expected: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type BiteshipWebhookEventName = "order.status" | "order.waybill_id" | "order.price";

export interface ParsedBiteshipWebhook {
  event: BiteshipWebhookEventName;
  /** Provider order id — the only stable key back to our shipment. */
  orderId: string | null;
  waybillId: string | null;
  trackingId: string | null;
  courierCompany: string | null;
  courierType: string | null;
  /** Raw provider status vocabulary (pending/confirmed/being_picked_up/...). */
  status: string | null;
  priceIdr: number | null;
  shippingFeeIdr: number | null;
  cashOnDeliveryFeeIdr: number | null;
  proofOfDeliveryFeeIdr: number | null;
}

const WEBHOOK_EVENTS: readonly BiteshipWebhookEventName[] = ["order.status", "order.waybill_id", "order.price"];

/**
 * Strict-but-tolerant parser. Every documented event carries a string
 * `order_id` — without it the webhook cannot be routed to a shipment and is
 * rejected. The provider's documented `shippment_fee` misspelling is
 * accepted alongside `shipping_fee`; numbers arrive in several shapes and
 * only finite values pass.
 */
export function parseBiteshipWebhook(body: unknown): ParsedBiteshipWebhook | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event : "";
  if (!WEBHOOK_EVENTS.includes(event as BiteshipWebhookEventName)) return null;
  const orderId = optionalString(record.order_id);
  if (!orderId) return null;
  return {
    event: event as BiteshipWebhookEventName,
    orderId,
    waybillId: optionalString(record.courier_waybill_id) ?? optionalString(record.waybill_id),
    trackingId: optionalString(record.courier_tracking_id) ?? optionalString(record.tracking_id),
    courierCompany: optionalString(record.courier_company),
    courierType: optionalString(record.courier_type),
    status: optionalString(record.status),
    priceIdr: optionalNumber(record.price) ?? optionalNumber(record.order_price),
    shippingFeeIdr: optionalNumber(record.shipping_fee) ?? optionalNumber(record.shipppment_fee) ?? optionalNumber(record.shippment_fee),
    cashOnDeliveryFeeIdr: optionalNumber(record.cash_on_delivery_fee),
    proofOfDeliveryFeeIdr: optionalNumber(record.proof_of_delivery_fee),
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}
