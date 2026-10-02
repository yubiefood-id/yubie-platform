import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";
import {
  FixedClock,
  InMemoryIdempotencyRepository,
  SequentialIdGenerator,
  createFirstPartyCheckout,
  processPaymentWebhook,
} from "@yubie/application";
import { PostgresTransactionManager, closeDatabase, createDatabase } from "../dist/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;
const NOW = "2026-10-02T00:00:00.000Z";

async function createIsolatedDatabase() {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_0009_test_${String(Date.now())}_${Math.floor(Math.random() * 10000)}`;
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

async function applyMigrations(sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
}

function makeStubProvider() {
  return {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      return { ok: true, value: { provider: "xendit", providerSessionId: `ps_${input.referenceId}`, redirectUrl: "https://xen.to/0009", rawStatus: "ACTIVE", expiresAt: "2026-10-03T00:00:00.000Z" } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
  };
}

test("migration 0009 creates the inventory core; checkout reserves FEFO atomically on PostgreSQL", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const bootstrap = postgres(testUrl, { max: 1 });
  await applyMigrations(bootstrap);
  await bootstrap.end();

  const database = createDatabase(testUrl);
  const tx = new PostgresTransactionManager(database);
  const provider = makeStubProvider();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator();

  try {
    // Operator-seeded lots: near-expiry first (FEFO), quarantined and expired never sell.
    await database.client`
      INSERT INTO inventory_lots (id, product_id, size_id, lot_code, quantity_on_hand, expiry_date, status, released_at, release_reason, created_at, updated_at) VALUES
        ('lot_far', 'flour', '250g', 'L-FAR', 10, DATE '2027-06-30', 'released', ${NOW}, 'coa', ${NOW}, ${NOW}),
        ('lot_near', 'flour', '250g', 'L-NEAR', 5, DATE '2026-11-30', 'released', ${NOW}, 'coa', ${NOW}, ${NOW}),
        ('lot_quarantine', 'flour', '250g', 'L-Q', 99, DATE '2027-06-30', 'quarantined', NULL, NULL, ${NOW}, ${NOW}),
        ('lot_expired', 'flour', '250g', 'L-E', 99, DATE '2026-09-30', 'released', ${NOW}, 'coa', ${NOW}, ${NOW})
    `;

    const input = {
      lines: [{ productId: "flour", sizeId: "250g", quantity: 7 }],
      customerEmail: "inv-pg@example.com",
      successReturnUrl: "https://yubie.id/checkout/success",
      cancelReturnUrl: "https://yubie.id/checkout/cancel",
      inventoryMode: "lots",
      idempotencyPrincipal: "guest",
      rawRequestBody: "{}",
    };
    const deps = { tx, provider, clock, ids };

    const checkout = await createFirstPartyCheckout(input, deps);
    assert.equal(checkout.ok, true);

    const near = await database.client`SELECT quantity_on_hand, status FROM inventory_lots WHERE id = 'lot_near'`;
    assert.equal(near[0].quantity_on_hand, 0);
    assert.equal(near[0].status, "depleted");
    const far = await database.client`SELECT quantity_on_hand FROM inventory_lots WHERE id = 'lot_far'`;
    assert.equal(far[0].quantity_on_hand, 8);

    const reservations = await database.client`SELECT quantity FROM inventory_reservations WHERE status = 'active'`;
    assert.equal(reservations.reduce((sum, row) => sum + row.quantity, 0), 7);
    const movements = await database.client`SELECT movement_type, quantity_delta FROM inventory_movements`;
    assert.equal(movements.filter((row) => row.movement_type === "reserve").length, 2);

    // Shortfall: the whole checkout transaction rolls back — no order, no
    // reservation, no lot movement survives.
    const ordersBefore = await database.client`SELECT count(*)::int AS n FROM orders`;
    const short = await createFirstPartyCheckout({ ...input, lines: [{ productId: "flour", sizeId: "250g", quantity: 20 }] }, deps);
    assert.equal(short.ok, false);
    assert.match(short.error.message, /Insufficient sellable inventory/);
    const ordersAfter = await database.client`SELECT count(*)::int AS n FROM orders`;
    assert.equal(ordersAfter[0].n, ordersBefore[0].n, "failed reservation leaves no draft order");
    const farAfterShort = await database.client`SELECT quantity_on_hand FROM inventory_lots WHERE id = 'lot_far'`;
    assert.equal(farAfterShort[0].quantity_on_hand, 8, "failed reservation leaves stock untouched");

    // Expired webhook releases the reservations back to sellable stock.
    const expired = await processPaymentWebhook({
      callbackToken: "token",
      expectedToken: "token",
      expectedBusinessId: "biz-1",
      payload: {
        event: "payment_session.expired",
        business_id: "biz-1",
        created: "2026-10-02T01:00:00Z",
        data: { payment_session_id: `ps_${checkout.value.checkoutRef}`, reference_id: checkout.value.checkoutRef, status: "EXPIRED", currency: "IDR", amount: checkout.value.totalAmount },
      },
    }, { tx, clock, ids });
    assert.deepEqual(expired, { result: "applied", paymentStatus: "expired" });

    const restoredNear = await database.client`SELECT quantity_on_hand, status FROM inventory_lots WHERE id = 'lot_near'`;
    assert.equal(restoredNear[0].quantity_on_hand, 5, "released reservation restores FEFO stock");
    assert.equal(restoredNear[0].status, "released");
    const activeAfter = await database.client`SELECT count(*)::int AS n FROM inventory_reservations WHERE status = 'active'`;
    assert.equal(activeAfter[0].n, 0);
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
});
