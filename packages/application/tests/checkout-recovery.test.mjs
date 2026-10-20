import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutPrincipalKey,
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

const NOW = "2026-10-20T00:00:00.000Z";

function makeDeps() {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const inventory = new InMemoryInventoryRepository();
  inventory.seedLot({ id: "lot_r", productId: "flour", sizeId: "250g", lotCode: "R", quantityOnHand: 10, expiryDate: "2027-06-30", status: "released", releasedAt: NOW, releaseReason: "coa", createdAt: NOW });
  const repos = {
    orders,
    payments,
    paymentEvents: new InMemoryPaymentEventRepository(),
    audit: new InMemoryAuditRepository(),
    outbox: new InMemoryOutboxRepository(),
    idempotency: new InMemoryIdempotencyRepository(),
    inbox: new InMemoryWebhookInboxRepository(),
    inventory,
  };
  const provider = {
    created: [],
    behaviour: "ok",
    async createPaymentSession(input) {
      this.created.push(input);
      if (this.behaviour === "throw") throw new Error("socket hang up after request was written");
      if (this.behaviour === "timeout") return { ok: false, error: { code: "timeout", message: "timed out", retryable: true, requestId: "p" } };
      return { ok: true, value: { provider: "ipaymu", providerSessionId: `sess-${input.referenceId}`, redirectUrl: `https://sandbox.example/pay/${input.referenceId}`, rawStatus: "ACTIVE", expiresAt: null } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
  };
  return { orders, payments, inventory, repos, provider, tx: new InMemoryTransactionManager(repos), clock: new FixedClock(NOW), ids: new SequentialIdGenerator() };
}

const INPUT = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }],
  customerEmail: "recovery@example.com",
  successReturnUrl: "https://staging.example/checkout/success",
  cancelReturnUrl: "https://staging.example/checkout/cancel",
  inventoryMode: "lots",
  provider: "ipaymu",
  idempotencyPrincipal: checkoutPrincipalKey({ guestToken: "R".repeat(43) }),
};

function activeReserved(deps) {
  return [...deps.inventory.reservations.values()].filter((row) => row.status === "active").reduce((sum, row) => sum + row.quantity, 0);
}

for (const behaviour of ["throw", "timeout"]) {
  test(`provider ${behaviour} after the request was sent: retryable, stock held, no second session on any retry`, async () => {
    const deps = makeDeps();
    deps.provider.behaviour = behaviour;
    const first = await createFirstPartyCheckout({ ...INPUT, idempotencyKey: "a-1" }, deps);
    assert.equal(first.ok, false);
    assert.equal(first.error.retryable, true);
    assert.ok(["timeout", "unavailable"].includes(first.error.code));
    const payment = [...deps.payments.items.values()][0];
    assert.equal(payment.reconciliationState, "ambiguous_create");
    assert.equal(payment.status, "pending");
    assert.equal(activeReserved(deps), 2, "reservation is not released while the outcome is unknown");

    deps.provider.behaviour = "ok";
    const sameKey = await createFirstPartyCheckout({ ...INPUT, idempotencyKey: "a-1" }, deps);
    const newKey = await createFirstPartyCheckout({ ...INPUT, idempotencyKey: "a-2" }, deps);
    for (const retry of [sameKey, newKey]) {
      assert.equal(retry.ok, false);
      assert.equal(retry.error.code, "pending_reconciliation");
    }
    assert.equal(deps.provider.created.length, 1, "the create is never blind-retried");
    assert.equal(deps.payments.items.size, 1);
  });
}

test("DB failure before TX2: session id kept, stock held, a retry is pending and never opens a second session", async () => {
  const deps = makeDeps();
  const failingTx = {
    run: async (operation, work) => {
      if (operation === "checkout.attach_session") throw new Error("connection reset");
      return deps.tx.run(operation, work);
    },
  };
  const first = await createFirstPartyCheckout({ ...INPUT, idempotencyKey: "b-1" }, { ...deps, tx: failingTx });
  assert.equal(first.ok, false);
  assert.equal(first.error.retryable, true);
  const payment = [...deps.payments.items.values()][0];
  assert.equal(payment.reconciliationState, "attach_failed");
  assert.ok(payment.providerSessionId, "session id is never lost");
  assert.equal(activeReserved(deps), 2);

  const retry = await createFirstPartyCheckout({ ...INPUT, idempotencyKey: "b-2" }, deps);
  assert.equal(retry.ok, false);
  assert.equal(retry.error.code, "pending_reconciliation", "a possibly cancelled session link is not handed out");
  assert.equal(deps.provider.created.length, 1);
});
