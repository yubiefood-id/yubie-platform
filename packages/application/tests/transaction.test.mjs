import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryAuditRepository,
  InMemoryIdempotencyRepository,
  InMemoryOrderRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemoryTransactionManager,
} from "../dist/index.js";

function makeRepos() {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  return { repos: { orders, payments, paymentEvents, audit, outbox, idempotency }, audit, outbox, idempotency };
}

test("TransactionManager hands work the shared transactional repositories", async () => {
  const { repos } = makeRepos();
  const manager = new InMemoryTransactionManager(repos);
  const seen = await manager.run("test.operation", async (tx) => {
    assert.equal(tx.orders, repos.orders);
    assert.equal(tx.payments, repos.payments);
    assert.equal(tx.paymentEvents, repos.paymentEvents);
    assert.equal(tx.audit, repos.audit);
    assert.equal(tx.outbox, repos.outbox);
    assert.equal(tx.idempotency, repos.idempotency);
    return "done";
  });
  assert.equal(seen, "done");
});

test("idempotency claim: same key + same hash is a duplicate, different hash is a conflict", async () => {
  const { idempotency } = makeRepos();
  const claim = {
    scope: "checkout",
    principalKey: "guest",
    operation: "createFirstPartyCheckout",
    idempotencyKey: "idem-1",
    requestHash: "hash-a",
    createdAt: "2026-10-02T00:00:00.000Z",
  };

  const first = await idempotency.claim(claim);
  assert.equal(first.ok, true);
  assert.equal(first.value.status, "claimed");

  const replay = await idempotency.claim({ ...claim });
  assert.equal(replay.ok, true);
  assert.equal(replay.value.status, "duplicate");

  const conflicting = await idempotency.claim({ ...claim, requestHash: "hash-b" });
  assert.equal(conflicting.ok, false);
  assert.equal(conflicting.error.code, "conflict");
});

test("idempotency claims are scoped per principal and operation", async () => {
  const { idempotency } = makeRepos();
  const base = {
    scope: "checkout",
    principalKey: "guest-1",
    operation: "createFirstPartyCheckout",
    idempotencyKey: "idem-1",
    requestHash: "hash-a",
    createdAt: "2026-10-02T00:00:00.000Z",
  };
  assert.equal((await idempotency.claim(base)).value.status, "claimed");
  const otherPrincipal = await idempotency.claim({ ...base, principalKey: "guest-2" });
  assert.equal(otherPrincipal.value.status, "claimed");
});
