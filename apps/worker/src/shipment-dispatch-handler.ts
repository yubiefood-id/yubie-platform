import { productFamilies, type OrderLineRecord } from "@yubie/domain";
import { createShippingProvider } from "@yubie/integrations";
import { parseShippingExecutionModeName } from "@yubie/config";
import { PostgresShipmentRepository, PostgresShippingCatalogRepository, type Database } from "@yubie/persistence";
import { increment } from "./metrics.js";

const LEASE_MS = 60_000;
const MAX_BOOKINGS_PER_RUN = 5;

/** Catalog sellable SKU for an order line (server authority, never the browser). */
function lineSku(productId: string, sizeId: string): string | null {
  const product = productFamilies.find((candidate) => candidate.id === productId && candidate.status === "available");
  const size = product?.sizes.find((candidate) => candidate.id === sizeId && candidate.available);
  return size?.sku ?? null;
}

/**
 * ADR-014 step 7 booking dispatch. The lease + deterministic reference are
 * COMMITted by claimDispatchIntents before any provider call; ambiguous
 * outcomes freeze the shipment (booking_unknown) and recovery relies on the
 * provider's reference uniqueness — never a blind retry. Modes: disabled and
 * shadow never book; pilot stays inside explicit operator bounds.
 */
export async function runShipmentDispatch(database: Database, correlationId: string): Promise<void> {
  const mode = parseShippingExecutionModeName(process.env.SHIPPING_EXECUTION_MODE);
  if (mode === "disabled") return;
  const provider = createShippingProvider(process.env);
  if (!provider) {
    console.log(JSON.stringify({ level: "info", event: "worker.shipment_dispatch_unadmitted", correlationId, mode }));
    return;
  }
  if (mode === "shadow") {
    // Shadow compares coverage/metrics only; creating provider orders is a
    // real charge and stays forbidden outside sandbox/pilot/enabled.
    console.log(JSON.stringify({ level: "info", event: "worker.shipment_dispatch_shadow", correlationId }));
    return;
  }
  const repo = new PostgresShipmentRepository(database);
  const now = new Date().toISOString();

  // Issue #73 P0-A: the bounded claim IS the enforcement — quota and budget
  // are admitted atomically under the pilot advisory lock, per lease, with
  // ambiguous outcomes holding reservation until reconciled. No pre-check.
  const bounds = mode === "pilot"
    ? { maxBookings: Number(process.env.SHIPPING_PILOT_MAX_BOOKINGS ?? "0"), budgetIdr: Number(process.env.SHIPPING_PILOT_BUDGET_IDR ?? "0") }
    : undefined;
  const leases = await repo.claimDispatchIntents(MAX_BOOKINGS_PER_RUN, now, LEASE_MS, bounds);
  if (leases.length === 0 && bounds) increment("shipment_pilot_quota_window_full_total");
  for (const lease of leases) {
    if (!lease.courierCompany || !lease.courierServiceCode || !lease.origin || !lease.delivery) {
      await repo.blockDispatch({ shipmentId: lease.shipmentId, intentId: lease.intentId, orderId: lease.orderId, reason: "DISPATCH_CONTEXT_INCOMPLETE" }, new Date().toISOString());
      console.error(JSON.stringify({ level: "warn", event: "worker.shipment_dispatch_blocked", shipmentId: lease.shipmentId, reason: "DISPATCH_CONTEXT_INCOMPLETE" }));
      increment("shipment_dispatch_blocked_total");
      continue;
    }
    const phone = typeof lease.delivery.phone === "string" ? lease.delivery.phone : (lease.customerPhone ?? "");
    const address = typeof lease.delivery.address === "string" ? lease.delivery.address : "";
    const postalCode = typeof lease.delivery.postalCode === "string" ? lease.delivery.postalCode : null;
    const name = (typeof lease.delivery.name === "string" ? lease.delivery.name : "") || (lease.customerName ?? "Pelanggan Yubie");
    if (!phone || !address) {
      await repo.blockDispatch({ shipmentId: lease.shipmentId, intentId: lease.intentId, orderId: lease.orderId, reason: "DESTINATION_INCOMPLETE" }, new Date().toISOString());
      increment("shipment_dispatch_blocked_total");
      continue;
    }
    // Issue #73 P0-B: dispatch-time business blockers re-verified against the
    // authoritative order/payment/inventory state (the packing check ran
    // earlier; recalls can land in between). Any blocker => held shipment,
    // machine-readable reason, audit event — never a partial booking.
    const blocker = await repo.dispatchBlockers(lease.shipmentId, lease.orderId);
    if (blocker) {
      await repo.blockDispatch({ shipmentId: lease.shipmentId, intentId: lease.intentId, orderId: lease.orderId, reason: blocker }, new Date().toISOString());
      console.error(JSON.stringify({ level: "warn", event: "worker.shipment_dispatch_blocked", shipmentId: lease.shipmentId, reason: blocker }));
      increment("shipment_dispatch_blocked_total");
      continue;
    }

    // Items are rebuilt server-side from the order lines + approved SKU
    // logistics profiles; weights never come from the browser. EVERY line
    // must resolve an effective profile — a paid order is never booked with
    // omitted or substituted goods (strict 1:1 mapping, no fabricated data).
    const lines = Array.isArray(lease.lines) ? (lease.lines as OrderLineRecord[]) : [];
    if (lines.length === 0) {
      await repo.blockDispatch({ shipmentId: lease.shipmentId, intentId: lease.intentId, orderId: lease.orderId, reason: "ORDER_LINES_MISSING" }, new Date().toISOString());
      increment("shipment_dispatch_blocked_total");
      continue;
    }
    const skus = lines.map((line) => lineSku(line.productId, line.sizeId)).filter((sku): sku is string => sku !== null);
    const catalog = new PostgresShippingCatalogRepository(database);
    const profiles = new Map((await catalog.findEffective(skus, now)).map((profile) => [profile.sku, profile]));
    const items: Array<{ name: string; category: "food_and_drink" | "frozen_food"; sku: string; valueIdr: number; quantity: number; weightGrams: number; lengthCm?: number; widthCm?: number; heightCm?: number }> = [];
    let lineBlock: string | null = null;
    for (const line of lines) {
      const sku = lineSku(line.productId, line.sizeId);
      const profile = sku ? profiles.get(sku) : undefined;
      if (!sku || !profile) { lineBlock = "SKU_PROFILE_MISSING"; break; }
      if (!Number.isSafeInteger(profile.weightGrams) || profile.weightGrams <= 0) { lineBlock = "PROFILE_WEIGHT_INVALID"; break; }
      if (profile.storageClass !== "shelf_stable") { lineBlock = "STORAGE_CLASS_BLOCKED"; break; }
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitPrice) || line.unitPrice <= 0) { lineBlock = "ORDER_LINE_INVALID"; break; }
      const category: "food_and_drink" | "frozen_food" = profile.storageClass === "shelf_stable" ? "food_and_drink" : "frozen_food";
      items.push({
        name: `${line.productName} ${line.sizeLabel}`.trim(),
        category,
        sku,
        valueIdr: line.unitPrice,
        quantity: line.quantity,
        weightGrams: profile.weightGrams,
        ...(profile.lengthCm ? { lengthCm: profile.lengthCm } : {}),
        ...(profile.widthCm ? { widthCm: profile.widthCm } : {}),
        ...(profile.heightCm ? { heightCm: profile.heightCm } : {}),
      });
    }
    if (lineBlock !== null) {
      await repo.blockDispatch({ shipmentId: lease.shipmentId, intentId: lease.intentId, orderId: lease.orderId, reason: lineBlock }, new Date().toISOString());
      console.error(JSON.stringify({ level: "warn", event: "worker.shipment_dispatch_blocked", shipmentId: lease.shipmentId, reason: lineBlock }));
      increment("shipment_dispatch_blocked_total");
      continue;
    }
    if (items.length !== lines.length) {
      await repo.blockDispatch({ shipmentId: lease.shipmentId, intentId: lease.intentId, orderId: lease.orderId, reason: "ITEM_COUNT_MISMATCH" }, new Date().toISOString());
      increment("shipment_dispatch_blocked_total");
      continue;
    }

    const result = await provider.createBooking({
      referenceId: lease.referenceId,
      origin: { contactName: lease.origin.contactName, contactPhone: lease.origin.contactPhone, address: lease.origin.address, ...(lease.origin.postalCode ? { postalCode: lease.origin.postalCode } : {}) },
      destination: { contactName: name, contactPhone: phone, address, ...(postalCode ? { postalCode } : {}) },
      courierCompany: lease.courierCompany,
      courierServiceCode: lease.courierServiceCode,
      courierType: lease.courierType ?? lease.courierServiceCode,
      deliveryType: "now",
      items,
      metadata: { orderId: lease.orderId, shipmentId: lease.shipmentId },
    });
    const outcomeAt = new Date().toISOString();
    if (result.ok) {
      let handle = result.value;
      if (handle.recoveredViaReferenceConflict) {
        // The provider already holds a booking under this exact reference.
        // Verify through the authoritative order read before trusting it.
        const verified = await provider.getOrder(handle.providerOrderId);
        if (!verified.ok || !verified.value) {
          await repo.recordBookingUnknown({ intentId: lease.intentId, shipmentId: lease.shipmentId, errorCode: "REFERENCE_CONFLICT_UNVERIFIED" }, outcomeAt);
          increment("shipment_booking_unknown_total");
          continue;
        }
        handle = verified.value;
      }
      await repo.recordBookingAccepted({
        intentId: lease.intentId,
        shipmentId: lease.shipmentId,
        orderId: lease.orderId,
        providerOrderId: handle.providerOrderId,
        referenceId: lease.referenceId,
        priceIdr: handle.priceIdr,
        waybillId: handle.waybillId,
        trackingId: handle.trackingId,
        trackingUrl: handle.trackingUrl,
        courierCompany: handle.courierCompany ?? lease.courierCompany,
        courierType: handle.courierType,
        rawStatus: handle.rawStatus,
      }, outcomeAt);
      console.log(JSON.stringify({ level: "info", event: "worker.shipment_booked", correlationId, shipmentId: lease.shipmentId, providerOrderId: handle.providerOrderId, priceIdr: handle.priceIdr }));
      increment("shipment_booked_total");
    } else if (result.error.code === "validation") {
      await repo.recordBookingRefused({ intentId: lease.intentId, shipmentId: lease.shipmentId, errorCode: `PROVIDER_${result.error.code.toUpperCase()}`, attempts: lease.attempts, maxAttempts: lease.maxAttempts }, outcomeAt);
      increment("shipment_dispatch_refused_total");
    } else {
      // timeout/unavailable: ambiguous — a booking may exist at the provider.
      await repo.recordBookingUnknown({ intentId: lease.intentId, shipmentId: lease.shipmentId, errorCode: `PROVIDER_${result.error.code.toUpperCase()}` }, outcomeAt);
      increment("shipment_booking_unknown_total");
    }
  }
}
