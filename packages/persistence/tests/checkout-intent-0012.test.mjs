import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";
import {
  FixedClock,
  SequentialIdGenerator,
  checkoutPrincipalKey,
  createFirstPartyCheckout,
} from "@yubie/application";
import { PostgresTransactionManager, closeDatabase, createDatabase } from "../dist/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;
const NOW = "2026-10-20T00:00:00.000Z";

async function createIsolatedDatabase() {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_0012_test_${String(Date.now())}_${Math.floor(Math.random() * 10000)}`;
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

async function applyMigrations(url, { through } = {}) {
  const sql = postgres(url, { max: 1 });
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    if (through && file > through) break;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
  await sql.end();
}

function makeProvider({ delayMs = 0 } = {}) {
  return {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { ok: true, value: { provider: "ipaymu", providerSessionId: `sess-${input.referenceId}`, redirectUrl: `https://sandbox.example/pay/${input.referenceId}`, rawStatus: "ACTIVE", expiresAt: null } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: false } }; },
  };
}

function guest(n) {
  return checkoutPrincipalKey({ guestToken: String(n).padStart(43, "g") });
}

const CART = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
  customerEmail: "concurrent@example.com",
  successReturnUrl: "https://staging.example/checkout/success",
  cancelReturnUrl: "https://staging.example/checkout/cancel",
  inventoryMode: "lots",
  provider: "ipaymu",
  promoCode: "YUBIE15",
};

async function seedLot(database, id, quantity) {
  await database.client`
    INSERT INTO inventory_lots (id, product_id, size_id, lot_code, quantity_on_hand, expiry_date, status, released_at, release_reason, created_at, updated_at)
    VALUES (${id}, 'flour', '250g', ${id}, ${quantity}, DATE '2027-06-30', 'released', ${NOW}, 'coa', ${NOW}, ${NOW})
  `;
}

async function withDatabase(work, options) {
  const { testUrl, dbName } = await createIsolatedDatabase();
  await applyMigrations(testUrl, options);
  const database = createDatabase(testUrl);
  try {
    await work({ database, testUrl, tx: new PostgresTransactionManager(database) });
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
}

const skip = !databaseUrl;

test("0012 prefixes legacy principals, unkeys older duplicates, and enforces the principal format", { skip }, async () => {
  await withDatabase(async ({ database, testUrl }) => {
    const sql = database.client;
    await sql`INSERT INTO orders (id, checkout_ref, checkout_public_token, status, customer_email, currency, subtotal_amount, grand_total_amount, total_amount, created_at, updated_at)
              VALUES ('ord_a', 'co_a', ${"a".repeat(32)}, 'pending_payment', 'a@example.com', 'IDR', 1000, 1000, 1000, ${NOW}, ${NOW}),
                     ('ord_b', 'co_b', ${"b".repeat(32)}, 'pending_payment', 'b@example.com', 'IDR', 1000, 1000, 1000, ${NOW}, ${NOW})`;
    await sql`INSERT INTO order_payments (id, order_id, provider, provider_session_id, amount, status, reconciliation_state, principal_key, request_hash, created_at, updated_at)
              VALUES ('pay_old', 'ord_a', 'ipaymu', 'sess-old', 1000, 'pending', 'ambiguous', 'user_1', 'h1', '2026-10-01T00:00:00Z', ${NOW}),
                     ('pay_new', 'ord_b', 'ipaymu', 'sess-new', 1000, 'pending', NULL, 'user_1', 'h1', '2026-10-02T00:00:00Z', ${NOW})`;

    await applyMigrations(testUrl);

    const rows = await sql`SELECT id, principal_key FROM order_payments ORDER BY id`;
    assert.deepEqual(rows.map((row) => [row.id, row.principal_key]), [["pay_new", "user:user_1"], ["pay_old", null]]);
    await assert.rejects(
      sql`UPDATE order_payments SET principal_key = 'guest' WHERE id = 'pay_old'`,
      /order_payments_principal_key_format/,
    );
    await assert.rejects(
      sql`UPDATE order_payments SET principal_key = 'user:user_1', reconciliation_state = 'ambiguous' WHERE id = 'pay_old'`,
      /order_payments_unresolved_request/,
      "an ambiguous pending intent is still covered by the unique index",
    );
  }, { through: "0011_checkout_intent.sql" });
});

for (const n of [2, 10, 100]) {
  test(`${n} concurrent identical submits with distinct keys create one order, one intent, one provider session`, { skip }, async () => {
    await withDatabase(async ({ database, tx }) => {
      await seedLot(database, "lot_c", 500);
      const provider = makeProvider({ delayMs: 20 });
      const deps = { tx, provider, clock: new FixedClock(NOW), ids: new SequentialIdGenerator() };
      const principal = guest(1);

      const results = await Promise.all(
        Array.from({ length: n }, (_, i) => createFirstPartyCheckout({ ...CART, idempotencyPrincipal: principal, idempotencyKey: `k-${i}` }, deps)),
      );

      const tokens = new Set(results.filter((r) => r.ok).map((r) => r.value.checkoutToken));
      for (const result of results) {
        if (!result.ok) assert.equal(result.error.code, "pending_reconciliation", JSON.stringify(result.error));
      }
      assert.ok(tokens.size <= 1, "every success points at the same checkout");
      assert.equal(provider.created.length, 1);

      const payments = await database.client`SELECT amount, principal_key FROM order_payments`;
      assert.equal(payments.length, 1);
      assert.equal(payments[0].principal_key, principal);
      assert.equal(payments[0].amount, 35000 - 5250);
      assert.equal(provider.created[0].amount, payments[0].amount);
      const orders = await database.client`SELECT count(*)::int AS n FROM orders`;
      assert.equal(orders[0].n, 1);
      const reserved = await database.client`SELECT coalesce(sum(quantity), 0)::int AS q FROM inventory_reservations WHERE status = 'active'`;
      assert.equal(reserved[0].q, 1);
    });
  });
}

test("10 concurrent submits under the same idempotency key create one intent", { skip }, async () => {
  await withDatabase(async ({ database, tx }) => {
    await seedLot(database, "lot_k", 50);
    const provider = makeProvider({ delayMs: 20 });
    const deps = { tx, provider, clock: new FixedClock(NOW), ids: new SequentialIdGenerator() };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => createFirstPartyCheckout({ ...CART, idempotencyPrincipal: guest(2), idempotencyKey: "same" }, deps)),
    );
    for (const result of results) {
      if (!result.ok) assert.equal(result.error.code, "pending_reconciliation", JSON.stringify(result.error));
    }
    assert.equal(provider.created.length, 1);
    const payments = await database.client`SELECT count(*)::int AS n FROM order_payments`;
    assert.equal(payments[0].n, 1);
  });
});

test("different guests with the same cart each get their own intent", { skip }, async () => {
  await withDatabase(async ({ database, tx }) => {
    await seedLot(database, "lot_g", 50);
    const provider = makeProvider();
    const deps = { tx, provider, clock: new FixedClock(NOW), ids: new SequentialIdGenerator() };
    const results = await Promise.all([3, 4, 5].map((g) => createFirstPartyCheckout({ ...CART, idempotencyPrincipal: guest(g), idempotencyKey: "k" }, deps)));
    assert.equal(results.every((r) => r.ok), true);
    assert.equal(new Set(results.map((r) => r.value.checkoutToken)).size, 3);
    const payments = await database.client`SELECT count(DISTINCT principal_key)::int AS n FROM order_payments`;
    assert.equal(payments[0].n, 3);
  });
});

test("10 guests racing for the last unit: one reservation, nine sold out, no oversell", { skip }, async () => {
  await withDatabase(async ({ database, tx }) => {
    await seedLot(database, "lot_last", 1);
    const provider = makeProvider({ delayMs: 10 });
    const deps = { tx, provider, clock: new FixedClock(NOW), ids: new SequentialIdGenerator() };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createFirstPartyCheckout({ ...CART, idempotencyPrincipal: guest(100 + i), idempotencyKey: `last-${i}` }, deps)),
    );
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.filter((r) => !r.ok && r.error.code === "out_of_stock").length, 9);
    assert.equal(provider.created.length, 1);
    const lot = await database.client`SELECT quantity_on_hand FROM inventory_lots WHERE id = 'lot_last'`;
    assert.equal(lot[0].quantity_on_hand, 0);
    const reserved = await database.client`SELECT coalesce(sum(quantity), 0)::int AS q FROM inventory_reservations WHERE status = 'active'`;
    assert.equal(reserved[0].q, 1);
    const orders = await database.client`SELECT count(*)::int AS n FROM orders`;
    assert.equal(orders[0].n, 1);
  });
});
