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
  reconcilePayments,
} from "../dist/index.js";

const NOW = "2026-10-02T12:00:00.000Z";

function makeDeps(providerStatus = "EXPIRED") {
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
  const provider = {
    polled: [],
    async getPaymentSession(providerSessionId) {
      this.polled.push(providerSessionId);
      return { ok: true, value: { provider: "xendit", providerSessionId, redirectUrl: "https://xen.to/r", rawStatus: providerStatus, expiresAt: null } };
    },
  };
  return { orders, payments, audit, inventory, tx, clock, ids, provider };
}

async function seedOrder(deps, { status = "pending_payment", createdAt = NOW, sessionStatus = "pending", expiresAt = "2026-10-02T11:00:00.000Z", session = "ps_recon_1" }) {
  await deps.orders.save({
    id: `ord_${Math.random().toString(36).slice(2, 8)}`,
    checkoutRef: `co_${Math.random().toString(36).slice(2, 8)}`,
    checkoutPublicToken: Math.random().toString(16).slice(2, 18).padEnd(16, "0").repeat(2).slice(0, 32),
    status,
    userId: null,
    customerEmail: "recon@example.com",
    customerName: null,
    delivery: null,
    currency: "IDR",
    totals: { subtotalAmount: 30000, shippingAmount: 0, discountAmount: 0, taxAmount: 0, grandTotalAmount: 30000 },
    totalAmount: 30000,
    shipping: { policy: "free_promotional", amount: 0 },
    lines: [],
    createdAt,
    updatedAt: createdAt,
  });
  const order = [...deps.orders.items.values()].at(-1);
  await deps.payments.save({
    id: `pay_${Math.random().toString(36).slice(2, 8)}`,
    orderId: order.id,
    provider: "xendit",
    providerSessionId: session,
    redirectUrl: null,
    currency: "IDR",
    amount: 30000,
    status: sessionStatus,
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  });
  return { order, payment: [...deps.payments.items.values()].at(-1) };
}

test("a pending payment past expiry polls the provider and transitions like the webhook would", async () => {
  const deps = makeDeps("COMPLETED");
  await seedOrder(deps, {});

  const report = await reconcilePayments(deps);
  assert.equal(report.value.polled, 1);
  assert.equal(report.value.transitioned, 1);
  const order = [...deps.orders.items.values()].at(-1);
  const payment = [...deps.payments.items.values()].at(-1);
  assert.equal(order.status, "paid");
  assert.equal(payment.status, "succeeded");
  assert.equal(deps.provider.polled.length, 1);
});

test("an expired provider session cancels the order and releases nothing to blind retries", async () => {
  const deps = makeDeps("EXPIRED");
  await seedOrder(deps, {});

  const report = await reconcilePayments(deps);
  assert.equal(report.value.transitioned, 1);
  const order = [...deps.orders.items.values()].at(-1);
  assert.equal(order.status, "cancelled");
  const payment = [...deps.payments.items.values()].at(-1);
  assert.equal(payment.status, "expired");
});

test("stale drafts without a delivered payment link are cancelled", async () => {
  const deps = makeDeps();
  const { order } = await seedOrder(deps, { status: "draft", createdAt: "2026-10-02T10:00:00.000Z", session: null, sessionStatus: "pending", expiresAt: null });
  const fresh = await seedOrder(deps, { status: "draft", createdAt: NOW, session: null, sessionStatus: "pending", expiresAt: null });

  const report = await reconcilePayments(deps);
  assert.equal(report.value.staleDraftsCancelled, 1);
  assert.equal(deps.orders.items.get(order.id).status, "cancelled");
  assert.equal(deps.orders.items.get(fresh.order.id).status, "draft", "fresh drafts are untouched");
  assert.ok(deps.audit.events.some((event) => event.action === "order.stale_draft_cancelled" && event.resourceId === order.id));
});

test("a draft with an attached session is flagged ambiguous, never cancelled blind", async () => {
  const deps = makeDeps();
  const { order } = await seedOrder(deps, { status: "draft", createdAt: "2026-10-02T10:00:00.000Z", session: "ps_unknown_outcome", sessionStatus: "pending", expiresAt: "2026-10-02T23:00:00.000Z" });

  const report = await reconcilePayments(deps);
  assert.equal(report.value.staleDraftsCancelled, 0);
  assert.equal(report.value.flaggedAmbiguous, 1);
  assert.equal(deps.orders.items.get(order.id).status, "draft", "unknown provider outcome keeps the order open for an operator");
  const payment = [...deps.payments.items.values()].find((item) => item.orderId === order.id);
  assert.equal(payment.reconciliationState, "ambiguous");
});

test("provider outages are skipped, not guessed", async () => {
  const deps = makeDeps();
  deps.provider.getPaymentSession = async () => ({ ok: false, error: { code: "unavailable", message: "network", retryable: true, requestId: "x" } });
  await seedOrder(deps, {});

  const report = await reconcilePayments(deps);
  assert.equal(report.value.polled, 1);
  assert.equal(report.value.transitioned, 0);
  const order = [...deps.orders.items.values()].at(-1);
  assert.equal(order.status, "pending_payment", "state unchanged when the provider cannot answer");
});

test("provider unreachable after local expiry does NOT make stock sellable", async () => {
  const deps = makeDeps("ACTIVE");
  deps.provider.getPaymentSession = async () => ({ ok: false, error: { code: "timeout", message: "network", retryable: true, requestId: "x" } });
  await seedOrder(deps, {}); // pending payment, expires 11:00, session attached
  deps.inventory.seedLot({ id: "lot_r1", productId: "flour", sizeId: "250g", lotCode: "R1", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  const order = [...deps.orders.items.values()].at(-1);
  await deps.inventory.reserveForOrder({ orderId: order.id, lines: [{ productId: "flour", sizeId: "250g", quantity: 3 }], now: NOW, expiresAt: "2026-10-02T11:00:00.000Z" });

  const report = await reconcilePayments(deps);
  assert.equal(report.value.polled, 1);
  assert.equal(report.value.transitioned, 0);
  const payment = [...deps.payments.items.values()].find((p) => p.orderId === order.id);
  assert.equal(payment.status, "pending", "outcome unknown — payment untouched");
  assert.equal(deps.inventory.lots.get("lot_r1").quantityOnHand, 7, "stock stays reserved; never released on a guess");
  assert.equal([...deps.inventory.reservations.values()].filter((r) => r.status === "active").length, 1);
});

test("delayed success after local expiry: poll resolves to paid and CONSUMES stock", async () => {
  const deps = makeDeps("COMPLETED");
  await seedOrder(deps, {});
  deps.inventory.seedLot({ id: "lot_r2", productId: "flour", sizeId: "250g", lotCode: "R2", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  const order = [...deps.orders.items.values()].at(-1);
  await deps.inventory.reserveForOrder({ orderId: order.id, lines: [{ productId: "flour", sizeId: "250g", quantity: 3 }], now: NOW, expiresAt: "2026-10-02T11:00:00.000Z" });

  const report = await reconcilePayments(deps);
  assert.equal(report.value.transitioned, 1);
  assert.equal(deps.orders.items.get(order.id).status, "paid");
  assert.equal(deps.inventory.lots.get("lot_r2").quantityOnHand, 7, "paid stock is consumed, not returned");
  assert.equal([...deps.inventory.reservations.values()].every((r) => r.status === "consumed"), true);
});

test("attach_failed draft: provider session ACTIVE gets cancelled and stock released; unreachable stays flagged", async () => {
  const deps = makeDeps("ACTIVE");
  const cancels = [];
  deps.provider.cancelPaymentSession = async (sessionId) => { cancels.push(sessionId); return { ok: true, value: { accepted: true } }; };
  const { order } = await seedOrder(deps, { status: "draft", createdAt: "2026-10-02T10:00:00.000Z", session: "ps_af_1", sessionStatus: "pending", expiresAt: "2026-10-02T23:00:00.000Z" });
  const payment = [...deps.payments.items.values()].find((p) => p.orderId === order.id);
  await deps.payments.save({ ...payment, reconciliationState: "attach_failed" });
  deps.inventory.seedLot({ id: "lot_r3", productId: "flour", sizeId: "250g", lotCode: "R3", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  await deps.inventory.reserveForOrder({ orderId: order.id, lines: [{ productId: "flour", sizeId: "250g", quantity: 4 }], now: NOW, expiresAt: "2026-10-02T23:00:00.000Z" });

  const report = await reconcilePayments(deps);
  assert.equal(report.value.staleDraftsCancelled, 1);
  assert.deepEqual(cancels, ["ps_af_1"], "live session cancelled at the provider exactly once");
  assert.equal(deps.orders.items.get(order.id).status, "cancelled");
  assert.equal(deps.inventory.lots.get("lot_r3").quantityOnHand, 10, "reservations released");

  // Same shape, provider unreachable: flag ambiguous, keep the draft open.
  const deps2 = makeDeps("ACTIVE");
  deps2.provider.getPaymentSession = async () => ({ ok: false, error: { code: "timeout", message: "network", retryable: true, requestId: "x" } });
  const seeded = await seedOrder(deps2, { status: "draft", createdAt: "2026-10-02T10:00:00.000Z", session: "ps_af_2", sessionStatus: "pending", expiresAt: "2026-10-02T23:00:00.000Z" });
  const payment2 = [...deps2.payments.items.values()].find((p) => p.orderId === seeded.order.id);
  await deps2.payments.save({ ...payment2, reconciliationState: "attach_failed" });

  const report2 = await reconcilePayments(deps2);
  assert.equal(report2.value.staleDraftsCancelled, 0);
  assert.equal(report2.value.flaggedAmbiguous, 1);
  assert.equal(deps2.orders.items.get(seeded.order.id).status, "draft");
});
