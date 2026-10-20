import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";
import {
  FixedClock,
  SequentialIdGenerator,
  applyIpaymuCallback,
  checkoutPrincipalKey,
  createFirstPartyCheckout,
} from "@yubie/application";
import { PostgresTransactionManager, closeDatabase, createDatabase } from "../dist/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;
const NOW = "2026-10-20T00:00:00.000Z";
const MERCHANT = "sandbox-va";

async function createIsolatedDatabase() {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_inv_test_${String(Date.now())}_${Math.floor(Math.random() * 10000)}`;
  await admin`CREATE DATABASE ${admin(dbName)}`;
  await admin.end();
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  return { testUrl: url.toString(), dbName };
}

async function dropIsolatedDatabase(dbName) {
  const admin = postgres(databaseUrl, { max: 1 });
  await admin`DROP DATABASE ${admin(dbName)} WITH (FORCE)`;
  await admin.end();
}

async function applyMigrations(url) {
  const sql = postgres(url, { max: 1 });
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
  await sql.end();
}

function guest(n) {
  return checkoutPrincipalKey({ guestToken: String(n).padStart(43, "i") });
}

function makeProvider() {
  return {
    created: [],
    mode: "ok",
    async createPaymentSession(input) {
      this.created.push(input);
      if (this.mode === "timeout") {
        return { ok: false, error: { code: "timeout", message: "timed out", retryable: true, requestId: "p" } };
      }
      return {
        ok: true,
        value: {
          provider: "ipaymu",
          providerSessionId: `sess-${input.referenceId}`,
          redirectUrl: `https://sandbox.example/pay/${input.referenceId}`,
          rawStatus: "ACTIVE",
          expiresAt: null,
        },
      };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: false } }; },
  };
}

const CART = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
  customerEmail: "invariants@example.com",
  successReturnUrl: "https://staging.example/checkout/success",
  cancelReturnUrl: "https://staging.example/checkout/cancel",
  inventoryMode: "lots",
  provider: "ipaymu",
};

test("Postgres invariants A, B, C, and E", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  await applyMigrations(testUrl);
  const database = createDatabase(testUrl);
  const tx = new PostgresTransactionManager(database);
  const provider = makeProvider();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();
  const deps = { tx, provider, clock, ids };
  try {
    await database.client`
      INSERT INTO inventory_lots (id, product_id, size_id, lot_code, quantity_on_hand, expiry_date, status, released_at, release_reason, created_at, updated_at)
      VALUES ('lot_inv', 'flour', '250g', 'INV', 100, DATE '2027-06-30', 'released', ${NOW}, 'coa', ${NOW}, ${NOW})
    `;

    // A — one principal and one cart, two submits: one intent.
    const principal = guest(1);
    const first = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: principal, idempotencyKey: "a-1" }, deps);
    const second = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: principal, idempotencyKey: "a-2" }, deps);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.value.checkoutToken, first.value.checkoutToken);
    const intents = await database.client`SELECT count(*)::int AS n FROM order_payments WHERE principal_key = ${principal}`;
    assert.equal(intents[0].n, 1, "A: one unresolved intent");

    // B — YUBIE15 grand total is what iPaymu is asked to charge, as one line.
    const promo = await createFirstPartyCheckout({
      ...CART,
      promoCode: "YUBIE15",
      idempotencyPrincipal: guest(2),
      idempotencyKey: "b-1",
    }, deps);
    assert.equal(promo.ok, true);
    assert.equal(promo.value.totalAmount, 29750);
    const sent = provider.created.find((item) => item.referenceId === promo.value.checkoutRef);
    assert.equal(sent.amount, 29750);
    assert.equal(sent.items.length, 1);
    assert.equal(sent.items[0].netUnitAmount, 29750);
    const stored = await database.client`SELECT amount FROM order_payments p JOIN orders o ON o.id = p.order_id WHERE o.checkout_ref = ${promo.value.checkoutRef}`;
    assert.equal(stored[0].amount, 29750);

    // C — timeout keeps the reservation and a retry does not open a second session.
    provider.mode = "timeout";
    const before = provider.created.length;
    const timedOut = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: guest(3), idempotencyKey: "c-1" }, deps);
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.error.retryable, true);
    provider.mode = "ok";
    const retried = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: guest(3), idempotencyKey: "c-2" }, deps);
    assert.equal(retried.ok, false);
    assert.equal(retried.error.code, "pending_reconciliation");
    assert.equal(provider.created.length, before + 1, "C: no second provider session");
    const held = await database.client`SELECT coalesce(sum(quantity), 0)::int AS q FROM inventory_reservations WHERE status = 'active' AND order_id IN (SELECT id FROM orders WHERE customer_email = 'invariants@example.com')`;
    assert.ok(held[0].q >= 3, "C: timed-out stock stays reserved");

    // E — only a matching authoritative success marks paid.
    const payable = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: guest(4), idempotencyKey: "e-1" }, deps);
    assert.equal(payable.ok, true);
    const ref = payable.value.checkoutRef;
    const amount = payable.value.totalAmount;
    const sessionId = `sess-${ref}`;
    const orderStatus = async () => (await database.client`SELECT status FROM orders WHERE checkout_ref = ${ref}`)[0].status;

    const rejected = [
      ["wrong merchant", { merchant: "other-va" }],
      ["wrong amount", { amount: amount - 1 }],
      ["wrong currency", { currency: "USD" }],
      ["wrong session", { sessionId: "sess-other" }],
      ["other reference on the transaction check", { authoritativeReferenceId: "co_other" }],
      ["other amount on the transaction check", { authoritativeAmount: amount - 1 }],
    ];
    for (const [name, patch] of rejected) {
      const result = await applyIpaymuCallback({
        referenceId: ref,
        merchant: MERCHANT,
        expectedMerchant: MERCHANT,
        amount,
        currency: "IDR",
        authoritativeStatus: "succeeded",
        authoritativeReferenceId: ref,
        authoritativeAmount: amount,
        trxId: "50",
        sessionId,
        dedupeKey: `reject:${name}`,
        ...patch,
      }, deps);
      assert.equal(result.result, "rejected", name);
      assert.equal(await orderStatus(), "pending_payment", name);
    }

    const unsettled = await applyIpaymuCallback({
      referenceId: ref,
      merchant: MERCHANT,
      expectedMerchant: MERCHANT,
      amount,
      authoritativeStatus: null,
      authoritativeReferenceId: null,
      authoritativeAmount: null,
      trxId: "6",
      sessionId,
      dedupeKey: "status-6",
    }, deps);
    assert.equal(unsettled.result, "pending", "status 6 stays unsettled");
    assert.equal(await orderStatus(), "pending_payment");

    const paid = await applyIpaymuCallback({
      referenceId: ref,
      merchant: MERCHANT,
      expectedMerchant: MERCHANT,
      amount,
      authoritativeStatus: "succeeded",
      authoritativeReferenceId: ref,
      authoritativeAmount: amount,
      trxId: "100",
      sessionId,
      dedupeKey: "paid",
    }, deps);
    assert.equal(paid.result, "applied");
    assert.equal(await orderStatus(), "paid");

    const replay = await applyIpaymuCallback({
      referenceId: ref,
      merchant: MERCHANT,
      expectedMerchant: MERCHANT,
      amount,
      authoritativeStatus: "succeeded",
      authoritativeReferenceId: ref,
      authoritativeAmount: amount,
      trxId: "100",
      sessionId,
      dedupeKey: "paid",
    }, deps);
    assert.equal(replay.result, "duplicate");
    const consumed = await database.client`SELECT count(*)::int AS n FROM inventory_reservations r JOIN orders o ON o.id = r.order_id WHERE o.checkout_ref = ${ref} AND r.status = 'consumed'`;
    assert.equal(consumed[0].n, 1, "replay does not consume stock again");
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
});
