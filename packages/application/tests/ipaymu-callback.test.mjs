import assert from "node:assert/strict";
import test from "node:test";
import {
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
  SequentialIdGenerator,
  applyIpaymuCallback,
} from "../dist/index.js";

const NOW = "2026-10-19T00:00:00.000Z";

function makeDeps() {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  const inbox = new InMemoryWebhookInboxRepository();
  const inventory = new InMemoryInventoryRepository();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();
  const tx = new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory });
  return { orders, payments, paymentEvents, inventory, clock, ids, tx };
}

async function seed(deps) {
  await deps.orders.save({
    id: "ord_1",
    checkoutRef: "co_test",
    checkoutPublicToken: "a".repeat(32),
    status: "pending_payment",
    userId: "user_1",
    customerEmail: "buyer@example.com",
    customerName: null,
    delivery: null,
    currency: "IDR",
    totals: { subtotalAmount: 35000, shippingAmount: 0, discountAmount: 0, taxAmount: 0, grandTotalAmount: 35000 },
    totalAmount: 35000,
    shipping: { policy: "free_promotional", amount: 0 },
    lines: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  await deps.payments.save({
    id: "pay_1",
    orderId: "ord_1",
    provider: "ipaymu",
    providerSessionId: "sess-1",
    redirectUrl: "https://sandbox.ipaymu.com/payment/sess-1",
    currency: "IDR",
    amount: 35000,
    status: "pending",
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  deps.inventory.seedLot({ id: "lot_1", productId: "flour", sizeId: "250g", lotCode: "L", quantityOnHand: 9, expiryDate: "2027-06-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  await deps.inventory.reserveForOrder({ orderId: "ord_1", lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }], now: NOW, expiresAt: "2026-10-20T00:00:00.000Z" });
}

const base = {
  referenceId: "co_test",
  merchant: "sandbox-va",
  expectedMerchant: "sandbox-va",
  amount: 35000,
  trxId: "99",
  sessionId: "sess-1",
  dedupeKey: "ipaymu:co_test:99:succeeded",
  authoritativeReferenceId: "co_test",
  authoritativeAmount: 35000,
};

test("authoritative success consumes stock once and a replay does not consume again", async () => {
  const deps = makeDeps();
  await seed(deps);
  const first = await applyIpaymuCallback({ ...base, authoritativeStatus: "succeeded" }, deps);
  assert.equal(first.result, "applied");
  assert.equal(deps.orders.items.get("ord_1").status, "paid");
  assert.equal([...deps.inventory.reservations.values()].every((row) => row.status === "consumed"), true);

  const replay = await applyIpaymuCallback({ ...base, authoritativeStatus: "succeeded" }, deps);
  assert.equal(replay.result, "duplicate");
  assert.equal(deps.orders.items.get("ord_1").status, "paid");
});

test("a callback without an authoritative check does not mark paid or release stock", async () => {
  const deps = makeDeps();
  await seed(deps);
  const result = await applyIpaymuCallback({ ...base, authoritativeStatus: null, dedupeKey: "unchecked" }, deps);
  assert.equal(result.result, "pending");
  assert.equal(deps.orders.items.get("ord_1").status, "pending_payment");
  assert.equal(deps.inventory.lots.get("lot_1").quantityOnHand, 8, "reservation stays deducted");
});

test("amount mismatch does not change the order", async () => {
  const deps = makeDeps();
  await seed(deps);
  const result = await applyIpaymuCallback({ ...base, amount: 1, authoritativeStatus: "succeeded", dedupeKey: "bad-amount" }, deps);
  assert.equal(result.result, "rejected");
  assert.equal(result.reason, "payment_amount_mismatch");
  assert.equal(deps.orders.items.get("ord_1").status, "pending_payment");
});

test("payment repository failure stays unavailable so the provider can retry", async () => {
  const result = await applyIpaymuCallback(base, {
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    tx: {
      async run(_operation, work) {
        return work({
          orders: { async findByCheckoutRef() { return { ok: true, value: { id: "ord_1" } }; } },
          payments: { async findByOrderId() { return { ok: false, error: { code: "unavailable" } }; } },
        });
      },
    },
  });
  assert.deepEqual(result, { persisted: false, result: "unavailable" });
});

test("missing payment record stays unavailable so a callback is never dropped", async () => {
  const result = await applyIpaymuCallback(base, {
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    tx: {
      async run(_operation, work) {
        return work({
          orders: { async findByCheckoutRef() { return { ok: true, value: { id: "ord_1" } }; } },
          payments: { async findByOrderId() { return { ok: true, value: [] }; } },
        });
      },
    },
  });
  assert.deepEqual(result, { persisted: false, result: "unavailable" });
});

for (const [name, patch, expectedReason] of [
  ["wrong merchant", { merchant: "other-va" }, "merchant_mismatch"],
  ["invalid callback amount", { amount: null }, "callback_amount_invalid"],
  ["wrong currency", { currency: "USD" }, "currency_mismatch"],
  ["wrong session", { sessionId: "sess-other" }, "session_mismatch"],
  ["transaction check for another reference", { authoritativeReferenceId: "co_other" }, "authoritative_mismatch"],
  ["transaction check for another amount", { authoritativeAmount: 1 }, "authoritative_mismatch"],
  ["status 6 unsettled", { authoritativeStatus: null, authoritativeReferenceId: null, authoritativeAmount: null }, null],
]) {
  test(`${name} never marks the order paid`, async () => {
    const deps = makeDeps();
    await seed(deps);
    const result = await applyIpaymuCallback({ ...base, authoritativeStatus: "succeeded", dedupeKey: name, ...patch }, deps);
    assert.notEqual(deps.orders.items.get("ord_1").status, "paid");
    if (name === "status 6 unsettled") assert.equal(result.result, "pending");
    else {
      assert.equal(result.result, "rejected");
      assert.equal(result.reason, expectedReason);
    }
  });
}
