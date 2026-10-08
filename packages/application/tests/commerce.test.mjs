import assert from "node:assert/strict";
import test from "node:test";
import {
  createFirstPartyCheckout,
  getAccountOrder,
  getCheckoutStatus,
  FixedClock,
  InMemoryAuditRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemoryTransactionManager,
  InMemoryWebhookInboxRepository,
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
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  const inbox = new InMemoryWebhookInboxRepository();
  const inventory = new InMemoryInventoryRepository();
  const provider = makeStubProvider();
  const clock = new FixedClock("2026-01-01T00:00:00.000Z");
  const ids = new SequentialIdGenerator();
  const tx = new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory });
  return { orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory, provider, clock, ids, tx };
}

const BASE_INPUT = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }],
  customerEmail: "customer@example.com",
  successReturnUrl: "https://yubie.id/checkout/success",
  cancelReturnUrl: "https://yubie.id/checkout/cancel",
  idempotencyPrincipal: "guest",
  rawRequestBody: "{}",
};

async function createOrder(deps, input = BASE_INPUT) {
  const result = await createFirstPartyCheckout(input, deps);
  assert.equal(result.ok, true);
  return result.value;
}

test("checkout re-prices from the catalog, applies the shipping policy, and ignores client money", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps, {
    ...BASE_INPUT,
    lines: [{ productId: "flour", sizeId: "250g", quantity: 2, unitPrice: 1, totalAmount: 1 }],
  });
  assert.equal(checkout.mode, "live");
  assert.equal(checkout.subtotalAmount, 70000);
  assert.equal(checkout.shippingAmount, 0);
  assert.equal(checkout.totalAmount, 70000);
  assert.match(checkout.checkoutToken, /^[0-9a-f]{32}$/, "opaque 128-bit public token");
  assert.equal(deps.provider.created.length, 1);
  assert.equal(deps.provider.created[0].referenceId, checkout.checkoutRef);
  assert.equal(deps.provider.created[0].amount, 70000);
  // The success URL carries the opaque token.
  assert.equal(deps.provider.created[0].successReturnUrl, `https://yubie.id/checkout/success?checkout=${checkout.checkoutToken}`);
});

test("checkout saga persists draft+intent, then pending_payment with the attached session", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);

  const order = await deps.orders.findById(checkoutTokenToId(deps, checkout));
  assert.equal(order.value.status, "pending_payment");
  assert.equal(order.value.totals.grandTotalAmount, 70000);
  assert.equal(order.value.shipping.policy, "free_promotional");
  const payment = (await deps.payments.findByOrderId(order.value.id)).value[0];
  assert.equal(payment.providerSessionId, "ps_test_1");
  assert.equal(payment.status, "pending");
  assert.ok(deps.audit.events.some((event) => event.action === "order.draft_created"));
  assert.ok(deps.audit.events.some((event) => event.action === "order.pending_payment"));
  assert.ok(deps.outbox.events.some((event) => event.eventType === "order.draft_created"));
});

function checkoutTokenToId(deps, checkout) {
  // The in-memory repo indexes by internal id; find it through the token.
  return [...deps.orders.items.values()].find((order) => order.checkoutPublicToken === checkout.checkoutToken).id;
}

test("DEFINITIVE provider rejection cancels the draft, releases stock, and replays as the same failure", async () => {
  const deps = makeDeps();
  deps.inventory.seedLot({ id: "lot_pf", productId: "flour", sizeId: "250g", lotCode: "PF", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: "2026-01-01T00:00:00.000Z", releaseReason: "coa", createdAt: "2026-01-01T00:00:00.000Z" });
  deps.provider.createPaymentSession = async () => ({ ok: false, error: { code: "validation", message: "rejected", retryable: false, requestId: "x" } });

  const input = { ...BASE_INPUT, inventoryMode: "lots", idempotencyKey: "pf-1", rawRequestBody: "{}" };
  const result = await createFirstPartyCheckout(input, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "validation");

  const order = [...deps.orders.items.values()][0];
  assert.equal(order.status, "cancelled");
  const payment = (await deps.payments.findByOrderId(order.id)).value[0];
  assert.equal(payment.status, "failed");
  assert.equal(payment.providerSessionId, null, "payment intent never attached a session");
  assert.equal(payment.reconciliationState, "provider_create_failed");
  assert.ok(deps.audit.events.some((event) => event.action === "order.provider_create_failed"));
  assert.equal(deps.inventory.lots.get("lot_pf").quantityOnHand, 10, "reservations released back to the lot immediately");
  assert.equal([...deps.inventory.reservations.values()].filter((r) => r.status === "active").length, 0);

  // Replay with the same key returns the SAME failure — never a fake success
  // and never a second provider call.
  const before = deps.provider.created.length;
  const replay = await createFirstPartyCheckout(input, deps);
  assert.equal(replay.ok, false);
  assert.equal(replay.error.code, "validation");
  assert.equal(deps.provider.created.length, before);
});

test("AMBIGUOUS provider create keeps the draft + reservations and never blind-retries", async () => {
  const deps = makeDeps();
  deps.inventory.seedLot({ id: "lot_am", productId: "flour", sizeId: "250g", lotCode: "AM", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: "2026-01-01T00:00:00.000Z", releaseReason: "coa", createdAt: "2026-01-01T00:00:00.000Z" });
  deps.provider.createPaymentSession = async () => ({ ok: false, error: { code: "timeout", message: "socket", retryable: true, requestId: "x" } });

  const input = { ...BASE_INPUT, inventoryMode: "lots", idempotencyKey: "am-1", rawRequestBody: "{}" };
  const result = await createFirstPartyCheckout(input, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "timeout");
  assert.equal(result.error.retryable, true);

  const order = [...deps.orders.items.values()][0];
  assert.equal(order.status, "draft", "ambiguous outcome never cancels definitively");
  const payment = (await deps.payments.findByOrderId(order.id)).value[0];
  assert.equal(payment.reconciliationState, "ambiguous_create");
  assert.equal(payment.providerSessionId, null);
  assert.equal(deps.inventory.lots.get("lot_am").quantityOnHand, 8, "stock stays reserved while the outcome is unknown");
  assert.equal([...deps.inventory.reservations.values()].filter((r) => r.status === "active").length, 1);
  assert.ok(deps.audit.events.some((event) => event.action === "order.provider_create_ambiguous"));

  // Replay with the same key while unresolved: conflict, no second create.
  const before = deps.provider.created.length;
  const replay = await createFirstPartyCheckout(input, deps);
  assert.equal(replay.ok, false);
  assert.equal(replay.error.code, "conflict");
  assert.equal(deps.provider.created.length, before);
});

test("a late webhook attaches an orphan session by reference and resolves an ambiguous create", async () => {
  const deps = makeDeps();
  let createdSession = null;
  deps.provider.createPaymentSession = async (input) => {
    createdSession = `ps_orphan_${input.referenceId}`;
    return { ok: true, value: { provider: "xendit", providerSessionId: createdSession, redirectUrl: "https://xen.to/o", rawStatus: "ACTIVE", expiresAt: null } };
  };
  const checkout = await createOrder(deps, { ...BASE_INPUT, inventoryMode: "none" });

  // Simulate the ambiguous state: intent exists, session never attached.
  const order = [...deps.orders.items.values()].find((item) => item.checkoutPublicToken === checkout.checkoutToken);
  const payment = (await deps.payments.findByOrderId(order.id)).value[0];
  await deps.payments.save({ ...payment, providerSessionId: null, reconciliationState: "ambiguous_create" });

  const applied = await processPaymentWebhook(
    WEBHOOK_INPUT({
      ...webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount }),
      data: { ...webhookPayload().data, payment_session_id: createdSession, reference_id: checkout.checkoutRef, status: "COMPLETED", currency: "IDR", amount: checkout.totalAmount },
    }),
    deps,
  );
  assert.equal(applied.result, "applied");
  const updated = (await deps.payments.findByOrderId(order.id)).value[0];
  assert.equal(updated.providerSessionId, createdSession, "orphan session attached by reference");
  assert.equal(updated.status, "succeeded");
  assert.equal(deps.orders.items.get(order.id).status, "paid");
});

test("TX2 failure persists the session id, compensates by cancelling at the provider, and stays webhook-matchable", async () => {
  const deps = makeDeps();
  const cancels = [];
  deps.provider.cancelPaymentSession = async (sessionId) => {
    cancels.push(sessionId);
    return { ok: true, value: { accepted: true } };
  };
  const failingTx = {
    run: async (operation, work) => {
      if (operation === "checkout.attach_session") throw new Error("simulated TX2 crash");
      return deps.tx.run(operation, work);
    },
  };

  const result = await createFirstPartyCheckout(BASE_INPUT, { ...deps, tx: failingTx });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");
  assert.match(result.error.message, /ps_test_1/, "session id preserved in diagnostics");
  assert.match(result.error.message, /cancelAccepted: true/);

  const order = [...deps.orders.items.values()][0];
  assert.equal(order.status, "draft", "draft stays recoverable");
  const payment = (await deps.payments.findByOrderId(order.id)).value[0];
  assert.equal(payment.providerSessionId, "ps_test_1", "session id persisted despite TX2 failure");
  assert.equal(payment.reconciliationState, "attach_failed");
  assert.deepEqual(cancels, ["ps_test_1"], "provider session cancelled exactly once, outside any transaction");
  assert.ok(deps.audit.events.some((event) => event.action === "order.attach_failed"));

  // The webhook for that session now MATCHES the payment row.
  const applied = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: order.checkoutRef, amount: order.totalAmount })), deps);
  assert.equal(applied.result, "applied");
});

test("a stock-out key is not poisoned: after restock the SAME key succeeds", async () => {
  const deps = makeDeps();
  for (const lot of deps.inventory.lots.values()) lot.quantityOnHand = 0; // only lot_pk is sellable
  deps.inventory.seedLot({ id: "lot_pk", productId: "flour", sizeId: "250g", lotCode: "PK", quantityOnHand: 1, expiryDate: "2027-06-30", status: "released", releasedAt: "2026-01-01T00:00:00.000Z", releaseReason: "coa", createdAt: "2026-01-01T00:00:00.000Z" });
  const input = { ...BASE_INPUT, inventoryMode: "lots", idempotencyKey: "pk-1", rawRequestBody: "{}" };

  const soldOut = await createFirstPartyCheckout(input, deps);
  assert.equal(soldOut.ok, false);
  assert.equal(soldOut.error.code, "out_of_stock");

  // Restock, then retry the SAME logical attempt.
  deps.inventory.lots.get("lot_pk").quantityOnHand = 50;
  const retry = await createFirstPartyCheckout(input, deps);
  assert.equal(retry.ok, true, "claim released with the failed attempt — key reusable after restock");
  assert.equal(deps.provider.created.length, 1);
});

test("idempotent replay returns the stored first response; a different request under the key conflicts", async () => {
  const deps = makeDeps();
  const input = {
    ...BASE_INPUT,
    idempotencyKey: "idem-1",
    rawRequestBody: JSON.stringify({ a: 1 }),
  };
  const first = await createFirstPartyCheckout(input, deps);
  assert.equal(first.ok, true);

  const replay = await createFirstPartyCheckout({ ...input, rawRequestBody: JSON.stringify({ a: 1 }) }, deps);
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.value, first.value);
  assert.equal(deps.provider.created.length, 1, "no second provider session on replay");

  const conflicting = await createFirstPartyCheckout({ ...input, rawRequestBody: JSON.stringify({ a: 2 }) }, deps);
  assert.equal(conflicting.ok, false);
  assert.equal(conflicting.error.code, "conflict");
});

test("checkout clamps quantity and rejects unavailable lines", async () => {
  const deps = makeDeps();
  const clamped = await createFirstPartyCheckout({ ...BASE_INPUT, lines: [{ productId: "flour", sizeId: "250g", quantity: 99 }] }, deps);
  assert.equal(clamped.ok, true);
  assert.equal(clamped.value.totalAmount, 20 * 35000);

  const unavailable = await createFirstPartyCheckout({ ...BASE_INPUT, lines: [{ productId: "shake", sizeId: "any", quantity: 1 }] }, deps);
  assert.equal(unavailable.ok, false);
  const mie = await createFirstPartyCheckout({ ...BASE_INPUT, lines: [{ productId: "mie", sizeId: "single", quantity: 1 }] }, deps);
  assert.equal(mie.ok, true);
  assert.equal(mie.value.totalAmount, 16000);
});

/** Official payment-session webhook shape (docs.xendit.co, verified 2026-10). */
function webhookPayload(overrides = {}) {
  return {
    event: overrides.event ?? "payment_session.completed",
    business_id: overrides.business_id ?? "biz-1",
    created: "2026-10-02T00:00:00Z",
    data: {
      payment_session_id: "ps_test_1",
      reference_id: overrides.reference_id,
      status: overrides.status ?? "COMPLETED",
      currency: "IDR",
      amount: overrides.amount,
      ...(overrides.payment_id === null ? {} : { payment_id: overrides.payment_id ?? "pay_test_1" }),
    },
  };
}

const WEBHOOK_INPUT = (payload) => ({ callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1", payload });

test("payment_session.completed transitions the order to paid exactly once", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  const order = [...deps.orders.items.values()].find((item) => item.checkoutPublicToken === checkout.checkoutToken);

  const applied = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount })), deps);
  assert.deepEqual(applied, { result: "applied", paymentStatus: "succeeded" });

  const duplicate = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount })), deps);
  assert.equal(duplicate.result, "duplicate");

  // Redelivery identity is (session, event): a re-send with a different
  // delivery timestamp or payment id is the SAME delivery and dedupes — the
  // unstable per-send timestamp must never let a redelivery masquerade as new.
  const redelivery = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount, payment_id: "pay_test_1_redelivery" })), deps);
  assert.equal(redelivery.result, "duplicate");

  const status = await getCheckoutStatus(checkout.checkoutToken, deps);
  assert.equal(status.value.orderStatus, "paid");
  assert.equal(status.value.paymentStatus, "succeeded");
  assert.equal(deps.paymentEvents.events.length, 1);
  assert.ok(deps.audit.events.some((event) => event.action === "order.paid" && event.resourceId === order.id));
});

test("public status view never contains PII; the account view does (ownership-checked path)", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  const order = [...deps.orders.items.values()].find((item) => item.checkoutPublicToken === checkout.checkoutToken);

  const status = await getCheckoutStatus(checkout.checkoutToken, deps);
  const view = JSON.stringify(status.value);
  assert.ok(!view.includes("customer"), "no customer fields in the public view");
  assert.ok(!view.includes("delivery"));
  assert.ok(!view.includes("@"), "no email addresses in the public view");
  assert.equal(status.value.totalAmount, 70000);

  const account = await getAccountOrder(order.id, deps);
  assert.equal(account.value.customerEmail, "customer@example.com");
  assert.equal(account.value.delivery, null);
});

test("webhook rejects invalid token, foreign business, bad amounts, and unknown references", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  const payload = webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount });

  const badToken = await processPaymentWebhook({ callbackToken: "wrong", expectedToken: "token", expectedBusinessId: "biz-1", payload }, deps);
  assert.deepEqual(badToken, { result: "rejected", code: "invalid_callback_token", status: 401 });

  const foreignBusiness = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount, business_id: "biz-attacker" })), deps);
  assert.deepEqual(foreignBusiness, { result: "rejected", code: "business_mismatch", status: 403 });

  const missingBusiness = await processPaymentWebhook({ callbackToken: "token", expectedToken: "token", expectedBusinessId: null, payload }, deps);
  assert.deepEqual(missingBusiness, { result: "rejected", code: "business_mismatch", status: 403 });

  const statusMismatch = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount, status: "ACTIVE" })), deps);
  assert.deepEqual(statusMismatch, { result: "rejected", code: "invalid_payload", status: 400 });

  const amountMismatch = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: 1 })), deps);
  assert.deepEqual(amountMismatch, { result: "rejected", code: "amount_mismatch", status: 409 });

  const referenceMismatch = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: "unknown", amount: checkout.totalAmount })), deps);
  assert.deepEqual(referenceMismatch, { result: "rejected", code: "unknown_reference", status: 404 });

  const malformed = await processPaymentWebhook(WEBHOOK_INPUT({ event: "payment_session.completed" }), deps);
  assert.deepEqual(malformed, { result: "rejected", code: "invalid_payload", status: 400 });

  const unknownEvent = await processPaymentWebhook(
    WEBHOOK_INPUT({ event: "payment.somefutureevent", business_id: "biz-1", data: { payment_session_id: "ps_test_1", reference_id: checkout.checkoutRef } }),
    deps,
  );
  assert.deepEqual(unknownEvent, { result: "ignored", reason: "unknown_event" });

  const status = await getCheckoutStatus(checkout.checkoutToken, deps);
  assert.equal(status.value.orderStatus, "pending_payment");
});

test("success-page poll reconciles browser-returns-before-webhook", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  deps.provider.sessionStatus = "COMPLETED";

  const status = await getCheckoutStatus(checkout.checkoutToken, deps, { poll: true });
  assert.equal(status.value.paymentStatus, "succeeded");
  assert.equal(status.value.orderStatus, "paid");

  // The webhook arriving afterwards is a harmless duplicate.
  const applied = await processPaymentWebhook(WEBHOOK_INPUT(webhookPayload({ reference_id: checkout.checkoutRef, amount: checkout.totalAmount })), deps);
  assert.equal(applied.result, "applied");
  const final = await getCheckoutStatus(checkout.checkoutToken, deps);
  assert.equal(final.value.orderStatus, "paid");
});

test("payment_session.expired cancels a pending order", async () => {
  const deps = makeDeps();
  const checkout = await createOrder(deps);
  const outcome = await processPaymentWebhook(
    WEBHOOK_INPUT(webhookPayload({ event: "payment_session.expired", status: "EXPIRED", reference_id: checkout.checkoutRef, amount: checkout.totalAmount, payment_id: null })),
    deps,
  );
  assert.deepEqual(outcome, { result: "applied", paymentStatus: "expired" });
  const status = await getCheckoutStatus(checkout.checkoutToken, deps);
  assert.equal(status.value.orderStatus, "cancelled");
});
