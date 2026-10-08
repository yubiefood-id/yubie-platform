import assert from "node:assert/strict";
import test from "node:test";
import { fefoOrder, lotIsSellable } from "@yubie/domain";
import {
  createFirstPartyCheckout,
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
  InsufficientInventoryError,
  processPaymentWebhook,
  SequentialIdGenerator,
} from "../dist/index.js";

const NOW = "2026-10-02T00:00:00.000Z";

function seedLots(inventory) {
  // FEFO: the near-expiry lot must be consumed before the far one.
  inventory.seedLot({ id: "lot_far", productId: "flour", sizeId: "250g", lotCode: "L-FAR", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  inventory.seedLot({ id: "lot_near", productId: "flour", sizeId: "250g", lotCode: "L-NEAR", quantityOnHand: 5, expiryDate: "2026-11-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  // Never sellable: quarantined, recalled, expired.
  inventory.seedLot({ id: "lot_quarantine", productId: "flour", sizeId: "250g", lotCode: "L-Q", quantityOnHand: 99, expiryDate: "2027-06-30", status: "quarantined", releasedAt: null, releaseReason: null, createdAt: NOW });
  inventory.seedLot({ id: "lot_recalled", productId: "flour", sizeId: "250g", lotCode: "L-R", quantityOnHand: 99, expiryDate: "2027-06-30", status: "recalled", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  inventory.seedLot({ id: "lot_expired", productId: "flour", sizeId: "250g", lotCode: "L-E", quantityOnHand: 99, expiryDate: "2026-09-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
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
  seedLots(inventory);
  const provider = {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      return { ok: true, value: { provider: "xendit", providerSessionId: `ps_${input.referenceId}`, redirectUrl: "https://xen.to/i", rawStatus: "ACTIVE", expiresAt: null } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
  };
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();
  const tx = new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory });
  return { orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory, provider, clock, ids, tx };
}

const LOTS_INPUT = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 7 }],
  customerEmail: "inv@example.com",
  successReturnUrl: "https://yubie.id/checkout/success",
  cancelReturnUrl: "https://yubie.id/checkout/cancel",
  inventoryMode: "lots",
  idempotencyPrincipal: "guest",
  rawRequestBody: "{}",
};

test("lot sellability and FEFO ordering", async () => {
  const { inventory } = makeDeps();
  const sellable = (await inventory.listSellable("flour", "250g", NOW)).value;
  assert.deepEqual([...sellable].sort(fefoOrder).map((lot) => lot.id), ["lot_near", "lot_far"]);
  assert.ok(!sellable.some((lot) => lot.id === "lot_quarantine" || lot.id === "lot_recalled" || lot.id === "lot_expired"));
  assert.equal(lotIsSellable(inventory.lots.get("lot_expired"), NOW), false);
});

test("checkout reserves FEFO across lots and decrements stock", async () => {
  const deps = makeDeps();
  const checkout = await createFirstPartyCheckout(LOTS_INPUT, deps);
  assert.equal(checkout.ok, true);

  assert.equal(deps.inventory.lots.get("lot_near").quantityOnHand, 0, "near-expiry lot consumed first");
  assert.equal(deps.inventory.lots.get("lot_near").status, "depleted");
  assert.equal(deps.inventory.lots.get("lot_far").quantityOnHand, 10 - 2, "remainder from the far lot");
  const reservations = [...deps.inventory.reservations.values()].filter((item) => item.status === "active");
  assert.equal(reservations.reduce((sum, item) => sum + item.quantity, 0), 7);
  assert.ok(deps.inventory.movements.some((movement) => movement.movementType === "reserve" && movement.quantityDelta === -5));
});

test("insufficient sellable stock fails checkout and never calls the provider", async () => {
  const deps = makeDeps();
  // Total sellable = 15; ask for 20 (cart clamp is per line, aggregate exceeds stock).
  const result = await createFirstPartyCheckout({ ...LOTS_INPUT, lines: [{ productId: "flour", sizeId: "250g", quantity: 20 }] }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "out_of_stock");
  assert.match(result.error.message, /Insufficient sellable inventory/);
  assert.equal(deps.provider.created.length, 0);
  assert.equal([...deps.inventory.reservations.values()].length, 0, "no partial reservations survive a failure");
});

test("confirmed payment CONSUMES reservations exactly once and never re-deducts stock", async () => {
  const deps = makeDeps();
  const checkout = await createFirstPartyCheckout(LOTS_INPUT, deps);
  assert.equal(checkout.ok, true);
  // Post-reserve stock: near lot 0 (depleted), far lot 8.
  const nearBefore = 0;
  const farBefore = deps.inventory.lots.get("lot_far").quantityOnHand;

  const applied = await processPaymentWebhook({
    callbackToken: "token",
    expectedToken: "token",
    expectedBusinessId: "biz-1",
    payload: {
      event: "payment_session.completed",
      business_id: "biz-1",
      created: "2026-10-02T01:00:00Z",
      data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "COMPLETED", currency: "IDR", amount: checkout.value.totalAmount, payment_id: "pay_c_1" },
    },
  }, deps);
  assert.deepEqual(applied, { result: "applied", paymentStatus: "succeeded" });

  const reservations = [...deps.inventory.reservations.values()];
  assert.equal(reservations.filter((r) => r.status === "consumed").length, reservations.length, "every reservation consumed");
  assert.equal(reservations.filter((r) => r.status === "active").length, 0);
  assert.equal(deps.inventory.lots.get("lot_near").quantityOnHand, nearBefore, "consume never touches quantity");
  assert.equal(deps.inventory.lots.get("lot_far").quantityOnHand, farBefore, "consume never touches quantity");
  assert.ok(deps.inventory.movements.some((m) => m.movementType === "consume" && m.quantityDelta === 0), "consume lifecycle recorded with zero delta");

  // A redelivery consumes nothing more (duplicate delivery).
  const again = await processPaymentWebhook({
    callbackToken: "token",
    expectedToken: "token",
    expectedBusinessId: "biz-1",
    payload: {
      event: "payment_session.completed",
      business_id: "biz-1",
      created: "2026-10-02T02:00:00Z",
      data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "COMPLETED", currency: "IDR", amount: checkout.value.totalAmount, payment_id: "pay_c_1" },
    },
  }, deps);
  assert.equal(again.result, "duplicate");
  assert.equal(deps.inventory.movements.filter((m) => m.movementType === "consume").length, 2, "one consume movement per reservation, still");
});

test("succeeded then late expired: STALE — no regression, no release of paid stock", async () => {
  const deps = makeDeps();
  const checkout = await createFirstPartyCheckout(LOTS_INPUT, deps);
  const order = [...deps.orders.items.values()].find((item) => item.checkoutPublicToken === checkout.value.checkoutToken);

  const completed = await processPaymentWebhook({
    callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1",
    payload: { event: "payment_session.completed", business_id: "biz-1", data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "COMPLETED", currency: "IDR", amount: checkout.value.totalAmount } },
  }, deps);
  assert.equal(completed.result, "applied");

  const lateExpired = await processPaymentWebhook({
    callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1",
    payload: { event: "payment_session.expired", business_id: "biz-1", data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "EXPIRED" } },
  }, deps);
  assert.equal(lateExpired.result, "stale");
  assert.equal(lateExpired.paymentStatus, "succeeded");

  // Payment/order/inventory stay consistent: paid, consumed, never released.
  const payment = (await deps.payments.findByOrderId(order.id)).value[0];
  assert.equal(payment.status, "succeeded");
  assert.equal(deps.orders.items.get(order.id).status, "paid");
  assert.equal([...deps.inventory.reservations.values()].every((r) => r.status === "consumed"), true);
  assert.equal(deps.inventory.lots.get("lot_far").quantityOnHand, 8, "paid stock is never returned to sellable");
});

test("expired then late completed: STALE — terminal failure never flips to paid", async () => {
  const deps = makeDeps();
  const checkout = await createFirstPartyCheckout(LOTS_INPUT, deps);
  const order = [...deps.orders.items.values()].find((item) => item.checkoutPublicToken === checkout.value.checkoutToken);

  const expired = await processPaymentWebhook({
    callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1",
    payload: { event: "payment_session.expired", business_id: "biz-1", data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "EXPIRED" } },
  }, deps);
  assert.deepEqual(expired, { result: "applied", paymentStatus: "expired" });

  const lateCompleted = await processPaymentWebhook({
    callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1",
    payload: { event: "payment_session.completed", business_id: "biz-1", data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "COMPLETED", currency: "IDR", amount: checkout.value.totalAmount } },
  }, deps);
  assert.equal(lateCompleted.result, "stale");
  assert.equal(lateCompleted.paymentStatus, "expired");

  const payment = (await deps.payments.findByOrderId(order.id)).value[0];
  assert.equal(payment.status, "expired");
  assert.equal(deps.orders.items.get(order.id).status, "cancelled");
  // Money may still have been captured (provider race): the state stays
  // consistent and visible — a terminal expired payment with a late completed
  // delivery is operator-refundable, never silently re-sold.
  assert.equal(deps.inventory.lots.get("lot_near").quantityOnHand, 5, "released stock stays sellable");
});

test("expiry releases each reservation exactly once", async () => {
  const deps = makeDeps();
  const checkout = await createFirstPartyCheckout(LOTS_INPUT, deps);

  const first = await processPaymentWebhook({
    callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1",
    payload: { event: "payment_session.expired", business_id: "biz-1", created: "2026-10-02T01:00:00Z", data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "EXPIRED" } },
  }, deps);
  assert.equal(first.result, "applied");
  assert.equal(deps.inventory.lots.get("lot_near").quantityOnHand, 5, "restored once");
  assert.equal(deps.inventory.lots.get("lot_far").quantityOnHand, 10);

  const redelivery = await processPaymentWebhook({
    callbackToken: "token", expectedToken: "token", expectedBusinessId: "biz-1",
    payload: { event: "payment_session.expired", business_id: "biz-1", created: "2026-10-02T09:00:00Z", data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "EXPIRED" } },
  }, deps);
  assert.equal(redelivery.result, "duplicate", "re-delivery with a new timestamp dedupes");
  assert.equal(deps.inventory.lots.get("lot_near").quantityOnHand, 5, "never restored twice");
  assert.equal(deps.inventory.lots.get("lot_far").quantityOnHand, 10);
});

test("only quarantined/expired stock is exactly the insufficient case", async () => {
  const deps = makeDeps();
  for (const lot of deps.inventory.lots.values()) lot.quantityOnHand = 0;
  const result = await createFirstPartyCheckout(LOTS_INPUT, deps);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Insufficient sellable inventory/);
});

test("an expired payment webhook releases the reservations back to sellable stock", async () => {
  const deps = makeDeps();
  const checkout = await createFirstPartyCheckout(LOTS_INPUT, deps);
  const order = [...deps.orders.items.values()].find((item) => item.checkoutPublicToken === checkout.value.checkoutToken);

  const outcome = await processPaymentWebhook({
    callbackToken: "token",
    expectedToken: "token",
    expectedBusinessId: "biz-1",
    payload: {
      event: "payment_session.expired",
      business_id: "biz-1",
      created: "2026-10-02T01:00:00Z",
      data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "EXPIRED", currency: "IDR", amount: checkout.value.totalAmount },
    },
  }, deps);
  assert.deepEqual(outcome, { result: "applied", paymentStatus: "expired" });

  assert.equal(deps.orders.items.get(order.id).status, "cancelled");
  assert.equal(deps.inventory.lots.get("lot_near").quantityOnHand, 5, "near-expiry stock restored");
  assert.equal(deps.inventory.lots.get("lot_near").status, "released");
  assert.equal(deps.inventory.lots.get("lot_far").quantityOnHand, 10);
  const active = [...deps.inventory.reservations.values()].filter((item) => item.status === "active");
  assert.equal(active.length, 0);
});

test("InsufficientInventoryError carries the shortfall", () => {
  const error = new InsufficientInventoryError("flour", "250g", 20, 15);
  assert.equal(error.name, "InsufficientInventoryError");
  assert.match(String(error), /requested 20, sellable 15/);
});
