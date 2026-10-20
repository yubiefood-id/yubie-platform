import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CHECKOUT_TOTAL_IDR,
  buildOrderTotals,
  quotePromotion,
} from "@yubie/domain";
import {
  buildProviderLineItems,
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
  SequentialIdGenerator,
} from "../dist/index.js";

/** Mirrors the iPaymu adapter's line-sum check so a mismatch fails the same way. */
function makeSumCheckingProvider(kind) {
  return {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      const lineTotal = input.items.reduce((sum, item) => sum + item.netUnitAmount * item.quantity, 0);
      if (lineTotal !== input.amount) {
        return { ok: false, error: { code: "validation", message: "line totals must equal amount", retryable: false, requestId: "stub" } };
      }
      return { ok: true, value: { provider: kind, providerSessionId: `sess-${this.created.length}`, redirectUrl: "https://sandbox.example/pay", rawStatus: "ACTIVE", expiresAt: null } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: false } }; },
  };
}

function makeDeps(kind = "ipaymu") {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  const inbox = new InMemoryWebhookInboxRepository();
  const inventory = new InMemoryInventoryRepository();
  const tx = new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory });
  return {
    orders,
    payments,
    provider: makeSumCheckingProvider(kind),
    clock: new FixedClock("2026-10-20T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    tx,
  };
}

const BASE = {
  customerEmail: "buyer@example.com",
  successReturnUrl: "https://staging.example/checkout/success",
  cancelReturnUrl: "https://staging.example/checkout/cancel",
  idempotencyPrincipal: "user:test",
  rawRequestBody: "{}",
  provider: "ipaymu",
};

const promoCases = [
  { name: "YUBIE15, one product", lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }], subtotal: 35000 },
  { name: "YUBIE15, several products", lines: [{ productId: "flour", sizeId: "1kg", quantity: 2 }, { productId: "shake", sizeId: "sachet", quantity: 3 }, { productId: "ppang", sizeId: "mini", quantity: 1 }], subtotal: 240000 + 58500 + 9000 },
];

for (const scenario of promoCases) {
  test(`iPaymu checkout charges the discounted grand total: ${scenario.name}`, async () => {
    const deps = makeDeps();
    const result = await createFirstPartyCheckout({ ...BASE, lines: scenario.lines, promoCode: "YUBIE15" }, deps);
    assert.equal(result.ok, true, JSON.stringify(result.error ?? null));
    const discount = Math.floor((scenario.subtotal * 15) / 100);
    const expected = scenario.subtotal - discount;
    assert.equal(result.value.totalAmount, expected);

    const sent = deps.provider.created[0];
    assert.equal(sent.amount, expected);
    assert.deepEqual(sent.items, [{ referenceId: result.value.checkoutRef, name: `Pesanan Yubie ${result.value.checkoutRef}`, quantity: 1, netUnitAmount: expected }]);

    const order = [...deps.orders.items.values()][0];
    const payment = (await deps.payments.findByOrderId(order.id)).value[0];
    assert.equal(order.totals.grandTotalAmount, expected);
    assert.equal(payment.amount, expected, "provider amount equals order_payments.amount");
    assert.equal(order.status, "pending_payment");
  });
}

test("iPaymu line builder includes shipping and discount in the single aggregate line", () => {
  const totals = buildOrderTotals(35000, 12000, 0, 5250);
  const priced = [{ id: "flour-250g", productId: "flour", productName: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 1, unitPrice: 35000 }];
  const items = buildProviderLineItems("ipaymu", "co_ref", priced, totals);
  assert.deepEqual(items, [{ referenceId: "co_ref", name: "Pesanan Yubie co_ref", quantity: 1, netUnitAmount: 41750 }]);
});

test("rounding remainder from the 15% discount is floored and the line still equals the grand total", () => {
  const subtotal = 33333;
  const promotion = quotePromotion("yubie15", subtotal);
  assert.equal(promotion.discountAmount, 4999);
  const totals = buildOrderTotals(subtotal, 0, 0, promotion.discountAmount);
  const items = buildProviderLineItems("ipaymu", "co_r", [], totals);
  assert.equal(items[0].netUnitAmount, 28334);
  assert.equal(items[0].netUnitAmount, totals.grandTotalAmount);
});

test("Xendit keeps per-product lines at catalog unit prices", () => {
  const totals = buildOrderTotals(70000, 0, 0, 0);
  const priced = [{ id: "flour-250g", productId: "flour", productName: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 35000 }];
  assert.deepEqual(buildProviderLineItems("xendit", "co_x", priced, totals), [
    { referenceId: "flour-250g", name: "Yubie Flour 250 g", quantity: 2, netUnitAmount: 35000 },
  ]);
});

for (const [label, totals] of [
  ["zero", buildOrderTotals(1000, 0, 0, 1000)],
  ["negative", buildOrderTotals(1000, 0, 0, 2000)],
  ["above the cap", buildOrderTotals(MAX_CHECKOUT_TOTAL_IDR + 1, 0, 0, 0)],
]) {
  test(`provider line builder refuses a ${label} grand total`, () => {
    assert.throws(() => buildProviderLineItems("ipaymu", "co_z", [], totals), /payable/);
  });
}

test("a cart above the checkout cap is refused before any order, intent, or provider call", async () => {
  const deps = makeDeps();
  const lines = Array.from({ length: 5 }, () => ({ productId: "shake", sizeId: "pack-7", quantity: 20 }));
  assert.ok(129000 * 20 * 5 > MAX_CHECKOUT_TOTAL_IDR);
  const result = await createFirstPartyCheckout({ ...BASE, lines }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "validation");
  assert.equal(deps.provider.created.length, 0);
  assert.equal(deps.orders.items.size, 0);
});
