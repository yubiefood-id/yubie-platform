import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NON_PKP_SHIPPING_TAX_POLICY,
  buildShipmentReferenceId,
  canApplyProviderShipmentStatus,
  canTransitionShipment,
  resolveShippingTax,
  shipmentProgressionRank,
} from "../dist/index.js";

test("shipment state machine only allows legal transitions", () => {
  assert.equal(canTransitionShipment("not_ready", "ready"), true);
  assert.equal(canTransitionShipment("not_ready", "cancelled"), true);
  assert.equal(canTransitionShipment("not_ready", "held"), true);
  assert.equal(canTransitionShipment("ready", "booking_pending"), true);
  assert.equal(canTransitionShipment("ready", "held"), true);
  assert.equal(canTransitionShipment("ready", "cancelled"), true);
  assert.equal(canTransitionShipment("booking_pending", "booked"), true);
  assert.equal(canTransitionShipment("booking_pending", "booking_unknown"), true);
  assert.equal(canTransitionShipment("booking_pending", "failed"), true);
  assert.equal(canTransitionShipment("booking_unknown", "booked"), true);
  assert.equal(canTransitionShipment("booking_unknown", "failed"), true);
  assert.equal(canTransitionShipment("booking_unknown", "cancelled"), true);
  assert.equal(canTransitionShipment("booked", "pickup_pending"), true);
  assert.equal(canTransitionShipment("booked", "picked"), true);
  assert.equal(canTransitionShipment("booked", "cancelled"), true);
  assert.equal(canTransitionShipment("booked", "failed"), true);
  assert.equal(canTransitionShipment("pickup_pending", "picked"), true);
  assert.equal(canTransitionShipment("pickup_pending", "failed"), true);
  assert.equal(canTransitionShipment("picked", "in_transit"), true);
  assert.equal(canTransitionShipment("picked", "delivered"), true);
  assert.equal(canTransitionShipment("picked", "returned"), true);
  assert.equal(canTransitionShipment("in_transit", "delivered"), true);
  assert.equal(canTransitionShipment("in_transit", "returned"), true);
  // A return can be opened after physical delivery (reverse logistics).
  assert.equal(canTransitionShipment("delivered", "returned"), true);
  assert.equal(canTransitionShipment("held", "ready"), true);
  assert.equal(canTransitionShipment("held", "cancelled"), true);
  // Ops may retry a failed booking with a new dispatch generation.
  assert.equal(canTransitionShipment("failed", "ready"), true);

  // A booking is never physical possession (ADR-014 step 8).
  assert.equal(canTransitionShipment("booked", "in_transit"), false);
  assert.equal(canTransitionShipment("ready", "picked"), false);
  assert.equal(canTransitionShipment("not_ready", "booked"), false);
  assert.equal(canTransitionShipment("delivered", "in_transit"), false);
  assert.equal(canTransitionShipment("cancelled", "ready"), false);
  assert.equal(canTransitionShipment("returned", "ready"), false);
  assert.equal(canTransitionShipment("delivered", "delivered"), false);
});

test("provider status application is monotonic along the physical chain", () => {
  assert.ok(shipmentProgressionRank("picked") > shipmentProgressionRank("booked"));
  assert.ok(shipmentProgressionRank("delivered") > shipmentProgressionRank("in_transit"));
  assert.equal(canApplyProviderShipmentStatus("booked", "pickup_pending"), true);
  assert.equal(canApplyProviderShipmentStatus("booked", "picked"), true);
  assert.equal(canApplyProviderShipmentStatus("pickup_pending", "picked"), true);
  assert.equal(canApplyProviderShipmentStatus("picked", "in_transit"), true);
  assert.equal(canApplyProviderShipmentStatus("in_transit", "delivered"), true);
  // Replayed or out-of-order provider events must be refused, not applied.
  assert.equal(canApplyProviderShipmentStatus("in_transit", "picked"), false);
  assert.equal(canApplyProviderShipmentStatus("delivered", "in_transit"), false);
  assert.equal(canApplyProviderShipmentStatus("picked", "booked"), false);
  assert.equal(canApplyProviderShipmentStatus("booked", "booked"), false);
});

test("reference ids are deterministic, bounded and unique per generation", () => {
  assert.equal(buildShipmentReferenceId("co_12_ab", 0, 1), "ybshp-co_12_ab-p0-g1");
  const id = buildShipmentReferenceId("co_12_ab", 0, 1);
  assert.ok(id.length <= 64, "provider reference ids stay within 64 chars");
  assert.equal(buildShipmentReferenceId("co_12_ab", 0, 1), id);
  assert.notEqual(buildShipmentReferenceId("co_12_ab", 0, 2), id);
  assert.notEqual(buildShipmentReferenceId("co_12_ab", 1, 1), id);
  assert.throws(() => buildShipmentReferenceId("", 0, 1), /non-empty/);
  assert.throws(() => buildShipmentReferenceId("co_1", -1, 1), /package index/);
  assert.throws(() => buildShipmentReferenceId("co_1", 0, 0), /generation/);
});

test("shipping tax is policy-driven and defaults to non-PKP zero", () => {
  assert.deepEqual(resolveShippingTax(25000, DEFAULT_NON_PKP_SHIPPING_TAX_POLICY), {
    amountIdr: 0,
    policyVersion: DEFAULT_NON_PKP_SHIPPING_TAX_POLICY.version,
  });
  // PKP exclusive policy computes from the approved rate basis points,
  // never a hardcoded 11%/12% multiplication.
  const pkp = { version: "pkp-2027-01", pkpStatus: "pkp", mode: "exclusive", rateBps: 1100, effectiveFrom: "2027-01-01" };
  assert.deepEqual(resolveShippingTax(20000, pkp), { amountIdr: 2200, policyVersion: "pkp-2027-01" });
  // Inclusive presentation never grows the customer total.
  assert.deepEqual(resolveShippingTax(20000, { ...pkp, mode: "inclusive" }), { amountIdr: 0, policyVersion: "pkp-2027-01" });
  // Non-PKP sellers must not present any tax line.
  assert.throws(() => resolveShippingTax(20000, { ...pkp, pkpStatus: "non_pkp" }), /non-PKP/);
  // A PKP exclusive policy without an approved rate is a configuration error.
  assert.throws(() => resolveShippingTax(20000, { ...pkp, rateBps: null }), /approved rate/);
  assert.throws(() => resolveShippingTax(20000, { ...pkp, rateBps: 0 }), /approved rate/);
});
