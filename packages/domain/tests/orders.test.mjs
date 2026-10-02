import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionOrder, orderStatusForPayment, paymentStatusFromProviderSession } from "../dist/index.js";

test("order state machine only allows legal transitions", () => {
  assert.equal(canTransitionOrder("draft", "pending_payment"), true);
  assert.equal(canTransitionOrder("pending_payment", "paid"), true);
  assert.equal(canTransitionOrder("paid", "processing"), true);
  assert.equal(canTransitionOrder("processing", "shipped"), true);
  assert.equal(canTransitionOrder("shipped", "completed"), true);
  assert.equal(canTransitionOrder("pending_payment", "cancelled"), true);

  assert.equal(canTransitionOrder("draft", "paid"), false);
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
  assert.equal(paymentStatusFromProviderSession("ACTIVE"), null);
  assert.equal(paymentStatusFromProviderSession("REQUIRES_ACTION"), null);
});
