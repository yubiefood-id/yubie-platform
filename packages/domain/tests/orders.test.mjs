import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderTotals, canTransitionOrder, orderStatusForPayment, paymentStatusFromProviderSession, resolveShippingPolicy } from "../dist/index.js";

test("order state machine only allows legal transitions", () => {
  assert.equal(canTransitionOrder("draft", "pending_payment"), true);
  // A verified payment may land while the order is still in the draft phase
  // (between TX1 and TX2 of the checkout saga): it auto-promotes to paid
  // rather than being silently dropped.
  assert.equal(canTransitionOrder("draft", "paid"), true);
  assert.equal(canTransitionOrder("pending_payment", "paid"), true);
  assert.equal(canTransitionOrder("paid", "processing"), true);
  assert.equal(canTransitionOrder("processing", "shipped"), true);
  assert.equal(canTransitionOrder("shipped", "completed"), true);
  assert.equal(canTransitionOrder("pending_payment", "cancelled"), true);

  assert.equal(canTransitionOrder("paid", "cancelled"), false);
  assert.equal(canTransitionOrder("completed", "processing"), false);
  assert.equal(canTransitionOrder("cancelled", "paid"), false);
});

test("payment statuses map onto the order status they authorize", () => {
  assert.equal(orderStatusForPayment("succeeded"), "paid");
  assert.equal(orderStatusForPayment("refunded"), "paid");
  assert.equal(orderStatusForPayment("failed"), "cancelled");
  assert.equal(orderStatusForPayment("expired"), "cancelled");
  assert.equal(orderStatusForPayment("cancelled"), "cancelled");
  assert.equal(orderStatusForPayment("pending"), null);
});

test("provider session statuses reconcile to payment statuses", () => {
  assert.equal(paymentStatusFromProviderSession("SUCCEEDED"), "succeeded");
  assert.equal(paymentStatusFromProviderSession("COMPLETED"), "succeeded");
  assert.equal(paymentStatusFromProviderSession("FAILED"), "failed");
  assert.equal(paymentStatusFromProviderSession("EXPIRED"), "expired");
  assert.equal(paymentStatusFromProviderSession("CANCELLED"), "cancelled");
  // Xendit spells the terminal session status with one L.
  assert.equal(paymentStatusFromProviderSession("CANCELED"), "cancelled");
  assert.equal(paymentStatusFromProviderSession("ACTIVE"), null);
  assert.equal(paymentStatusFromProviderSession("REQUIRES_ACTION"), null);
});

test("shipping policy is explicit and totals always sum exactly", () => {
  assert.deepEqual(resolveShippingPolicy(undefined), {
    policy: "free_promotional",
    amount: 0,
    reason: "Promotional free shipping (time-limited, operator approved)",
  });
  assert.throws(() => resolveShippingPolicy("free_soon"), /Unknown SHIPPING_POLICY/);
  assert.deepEqual(buildOrderTotals(30000, 0, 0, 0), { subtotalAmount: 30000, shippingAmount: 0, discountAmount: 0, taxAmount: 0, grandTotalAmount: 30000 });
  assert.deepEqual(buildOrderTotals(28000, 5000, 1100, 1000), { subtotalAmount: 28000, shippingAmount: 5000, discountAmount: 1000, taxAmount: 1100, grandTotalAmount: 33100 });
});
