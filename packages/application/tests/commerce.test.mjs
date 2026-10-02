import assert from "node:assert/strict";
import test from "node:test";
import {
  createFirstPartyCheckout,
  getCheckoutStatus,
  FixedClock,
  InMemoryOrderRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  processPaymentWebhook,
  SequentialIdGenerator,
} from "../dist/index.js";

function makeStubProvider() {
  return {
    created: [],
    sessionStatus: "ACTIVE",
    async createPaymentSession(input) {
      this.created.push(input);
      return { ok: true, value: { provider: "xendit", providerSessionId: "ps_test_1", redirectUrl: "https://xen.to/test", rawStatus: "ACTIVE", expiresAt: "2026-01-02T00:00:00.000Z" } };
    },
    async getPaymentSession(providerSessionId) {
      return { ok: true, value: { provider: "xendit", providerSessionId, redirectUrl: "https://xen.to/test", rawStatus: this.sessionStatus, expiresAt: null } };
    },
    async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
  };
}

function makeDeps() {
  return {
    orders: new InMemoryOrderRepository(),
    payments: new InMemoryPaymentRepository(),
    paymentEvents: new InMemoryPaymentEventRepository(),
    provider: makeStubProvider(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
  };
}

const BASE_INPUT = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }],
  customerEmail: "customer@example.com",
  successReturnUrl: "https://yubie.id/checkout/success",
  cancelReturnUrl: "https://yubie.id/checkout/cancel",
};

test("checkout re-prices from the catalog and ignores client money", async () => {
  const deps = makeDeps();
  const result = await createFirstPartyCheckout({
    ...BASE_INPUT,
    lines: [{ productId: "flour", sizeId: "250g", quantity: 2, unitPrice: 1, totalAmount: 1 }],
  }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.value.totalAmount, 30000);
  assert.equal(result.value.mode, "live");
  assert.equal(typeof result.value.redirectUrl, "string");
  // Port-level contract: the provider receives provider-neutral fields only
  // (session_type/country/capture_method live in the Xendit adapter).
  assert.equal(deps.provider.created[0].referenceId, result.value.checkoutRef);
  assert.equal(deps.provider.created[0].amount, 30000);
  assert.equal(deps.provider.created[0].currency, "IDR");
  assert.equal(deps.provider.created[0].items.length, 1);
});

test("checkout clamps quantity and rejects unavailable lines", async () => {
  const deps = makeDeps();
  const clamped = await createFirstPartyCheckout({ ...BASE_INPUT, lines: [{ productId: "flour", sizeId: "250g", quantity: 99 }] }, deps);
  assert.equal(clamped.ok, true);
  assert.equal(clamped.value.totalAmount, 20 * 15000);

  const unavailable = await createFirstPartyCheckout({ ...BASE_INPUT, lines: [{ productId: "shake", sizeId: "any", quantity: 1 }] }, deps);
  assert.equal(unavailable.ok, false);
  const mie = await createFirstPartyCheckout({ ...BASE_INPUT, lines: [{ productId: "mie", sizeId: "any", quantity: 1 }] }, deps);
  assert.equal(mie.ok, false);
});

function webhookPayload(overrides = {}) {
  return {
    id: "wh-1",
    event: "payment.succeeded",
    data: {
      payment_session_id: "ps_test_1",
      reference_id: overrides.reference_id,
      business_id: "biz-1",
      currency: "IDR",
      amount: overrides.amount,
      status: "SUCCEEDED",
    },
  };
}

async function createOrder(deps) {
  const result = await createFirstPartyCheckout(BASE_INPUT, deps);
  assert.equal(result.ok, true);
  return result.value;
}

test("webhook success transitions the order to paid exactly once", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);

  const applied = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount }) }, deps);
  assert.deepEqual(applied, { result: "applied", paymentStatus: "succeeded" });

  const duplicate = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount }) }, deps);
  assert.equal(duplicate.result, "duplicate");

  const status = await getCheckoutStatus(checkout.checkoutId, deps);
  assert.equal(status.value.orderStatus, "paid");
  assert.equal(status.value.paymentStatus, "succeeded");
  assert.equal(deps.paymentEvents.events.length, 1);
});

test("webhook rejects invalid token, bad amounts, and unknown references", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  const payload = webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount });

  const badToken = await processPaymentWebhook({ callbackToken: "wrong", expectedToken: "token", payload }, deps);
  assert.deepEqual(badToken, { result: "rejected", code: "invalid_callback_token", status: 401 });

  const amountMismatch = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: webhookPayload({ reference_id: checkout.checkoutRef, amount: 1 }) }, deps);
  assert.deepEqual(amountMismatch, { result: "rejected", code: "amount_mismatch", status: 409 });

  const referenceMismatch = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: webhookPayload({ reference_id: "unknown", amount: checkout.totalAmount }) }, deps);
  assert.deepEqual(referenceMismatch, { result: "rejected", code: "unknown_reference", status: 404 });

  const malformed = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: { event: "payment.succeeded" } }, deps);
  assert.deepEqual(malformed, { result: "rejected", code: "invalid_payload", status: 400 });

  const unknownEvent = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: { id: "wh-x", event: "payment.somefutureevent", data: { payment_session_id: "ps_test_1", reference_id: checkout.checkoutRef } } }, deps);
  assert.deepEqual(unknownEvent, { result: "ignored", reason: "unknown_event" });

  const status = await getCheckoutStatus(checkout.checkoutId, deps);
  assert.equal(status.value.orderStatus, "pending_payment");
});

test("success-page poll reconciles browser-returns-before-webhook", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  deps.provider.sessionStatus = "SUCCEEDED";

  const status = await getCheckoutStatus(checkout.checkoutId, deps, { poll: true });
  assert.equal(status.value.paymentStatus, "succeeded");
  assert.equal(status.value.orderStatus, "paid");

  // The webhook arriving afterwards is a harmless duplicate.
  const applied = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", payload: webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount }) }, deps);
  assert.equal(applied.result, "applied");
  const final = await getCheckoutStatus(checkout.checkoutId, deps);
  assert.equal(final.value.orderStatus, "paid");
});

test("expired webhook cancels a pending order", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  const outcome = await processPaymentWebhook({
    callbackToken: "token",
    expectedToken: "token",
    payload: { id: "wh-2", event: "payment.expired", data: { payment_session_id: "ps_test_1", reference_id: checkout.checkoutRef, currency: "IDR", amount: checkout.totalAmount } },
  }, deps);
  assert.deepEqual(outcome, { result: "applied", paymentStatus: "expired" });
  const status = await getCheckoutStatus(checkout.checkoutId, deps);
  assert.equal(status.value.orderStatus, "cancelled");
});
