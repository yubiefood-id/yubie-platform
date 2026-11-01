import { canApplyProviderShipmentStatus, type ShipmentStatus } from "@yubie/domain";
import { mapBiteshipStatus } from "@yubie/integrations";
import { PostgresShipmentRepository, PostgresShipmentProviderInbox, PostgresOperations, type Database } from "@yubie/persistence";
import { increment } from "./metrics.js";

const SYSTEM_ACTOR = "system:biteship";

/**
 * ADR-014 steps 8-9: drain the authenticated Biteship inbox idempotently.
 * Forward physical statuses apply monotonically; `picked`/`delivered` drive
 * SERVER-AUTHORIZED order transitions through the same operations command
 * (re-verifying paid payment, holds, lots and the strict stage chain) —
 * never a simulated staff mark. A stage CONFLICT (staff edited concurrently)
 * requeues the event for the next run.
 */
export async function runShipmentNotifications(database: Database, correlationId: string): Promise<void> {
  const inbox = new PostgresShipmentProviderInbox(database);
  const shipments = new PostgresShipmentRepository(database);
  const operations = new PostgresOperations(database, { writesEnabled: true, checkoutAdmission: "enabled", ...(process.env.YUBIE_ENV ? { environment: process.env.YUBIE_ENV } : {}) });
  const now = new Date().toISOString();

  const events = await inbox.claim(10, now);
  for (const event of events) {
    try {
      if (event.event === "order.price") {
        const price = numberField(event.payload.price);
        if (event.providerOrderId && price !== null) {
          await shipments.recordPriceChange({ providerOrderId: event.providerOrderId, priceIdr: price, shippingFeeIdr: numberField(event.payload.shipping_fee ?? event.payload.shipppment_fee), occurredAt: now }, now);
          increment("shipment_price_change_total");
        }
        await inbox.finish(event.id, true);
        continue;
      }
      if (event.event === "order.waybill_id") {
        if (event.providerOrderId && event.waybillId) {
          await shipments.applyProviderStatus({
            providerOrderId: event.providerOrderId,
            neutralStatus: "booked",
            waybillId: event.waybillId,
            trackingId: event.trackingId,
            trackingUrl: null,
            rawStatus: event.status ?? "waybill_update",
            occurredAt: now,
          }, (current, observed) => current === "booking_pending" && observed === "booked");
        }
        await inbox.finish(event.id, true);
        continue;
      }
      // order.status
      const neutral = mapBiteshipStatus(event.status);
      if (!event.providerOrderId || !neutral) {
        await inbox.finish(event.id, true);
        continue;
      }
      if (neutral === "cancelled" || neutral === "returned" || neutral === "held" || neutral === "failed") {
        await shipments.applyProviderExceptional(event.providerOrderId, neutral, now);
        increment(`shipment_provider_${neutral}_total`);
        await inbox.finish(event.id, true);
        continue;
      }
      const outcome = await shipments.applyProviderStatus({
        providerOrderId: event.providerOrderId,
        neutralStatus: neutral,
        waybillId: event.waybillId,
        trackingId: event.trackingId,
        trackingUrl: trackingUrlFrom(event.payload),
        rawStatus: event.status ?? "",
        occurredAt: now,
      }, (current, observed) => canApplyProviderShipmentStatus(current as ShipmentStatus, observed as ShipmentStatus));
      increment(outcome.applied ? "shipment_provider_advanced_total" : "shipment_provider_ignored_total");
      if (outcome.applied && outcome.shipment) {
        const advanced = await advanceOrderFulfillment(operations, shipments, outcome.shipment.orderId, event.providerOrderId, neutral, event.waybillId, now);
        if (!advanced) {
          // A concurrent staff edit changed the fulfillment version; retry on
          // the next run instead of forcing the transition.
          await inbox.finish(event.id, false, "FULFILLMENT_VERSION_CONFLICT");
          continue;
        }
      }
      await inbox.finish(event.id, true);
    } catch (error) {
      const errorCode = error instanceof Error && /^[A-Z0-9_]{1,32}$/.test(error.name) ? error.name : "SHIPMENT_EVENT_FAILED";
      increment("shipment_event_error_total");
      console.error(JSON.stringify({ level: "error", event: "worker.shipment_event_failed", correlationId, inboxId: event.id, errorCode: String((error as { code?: unknown })?.code ?? errorCode) }));
      await inbox.finish(event.id, false, "SHIPMENT_EVENT_FAILED");
    }
  }
}

async function advanceOrderFulfillment(operations: PostgresOperations, shipments: PostgresShipmentRepository, orderId: string, providerOrderId: string, neutral: ShipmentStatus, waybillId: string | null, now: string): Promise<boolean> {
  const shipment = await shipments.findByProviderOrderId(providerOrderId);
  if (!shipment) return true;
  const stage = neutral === "delivered" ? "delivered" : neutral === "picked" ? "shipped" : null;
  if (!stage) return true;
  const carrier = `biteship:${shipment.courierCompany ?? "courier"}`.slice(0, 100);
  const tracking = (waybillId ?? shipment.waybillId ?? providerOrderId).slice(0, 120);
  try {
    const current = await operations.fulfillmentStage(orderId);
    await operations.fulfill(SYSTEM_ACTOR, `${neutral}-${providerOrderId}`.replace(/[^A-Za-z0-9_-]/g, "_"), orderId, {
      expectedVersion: current?.version ?? 0,
      stage,
      ...(stage === "shipped" || !current?.carrier ? { carrier, trackingNumber: tracking } : {}),
      reason: `Biteship provider ${neutral} confirmed${stage === "delivered" ? " delivery" : " pickup"}`,
    });
    increment(`shipment_order_${stage}_total`);
    return true;
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "CONFLICT") return false;
    // Business guards (payment unverified, holds, bad lots) must block the
    // transition — surface it and leave the event requeue decision explicit.
    if (code === "FORBIDDEN" || code === "VALIDATION") {
      console.error(JSON.stringify({ level: "error", event: "worker.shipment_order_transition_blocked", orderId, providerOrderId, neutral, code: String(code), at: now }));
      return true;
    }
    throw error;
  }
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function trackingUrlFrom(payload: Record<string, unknown>): string | null {
  return typeof payload.courier_link === "string" && payload.courier_link.startsWith("https://") ? payload.courier_link.slice(0, 300) : null;
}
