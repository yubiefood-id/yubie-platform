import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";
import {
  createDatabase,
  PostgresIdempotencyRepository,
  PostgresTransactionManager,
  closeDatabase,
} from "../dist/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;

/**
 * Schema-mutating suites share one Postgres instance; this suite runs in an
 * isolated throwaway database so it never races the migration-proof suites
 * (which drop/recreate the shared schema).
 */
async function createIsolatedDatabase() {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_tx_test_${String(Date.now())}_${Math.floor(Math.random() * 10000)}`;
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

test("transaction manager: commit keeps every write, rollback keeps none", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const bootstrap = postgres(testUrl, { max: 1 });
  await applyMigrations(bootstrap);
  await bootstrap.end();

  const database = createDatabase(testUrl);
  const manager = new PostgresTransactionManager(database);
  const now = "2026-10-02T00:00:00.000Z";

  try {
    // Committed unit: order + payment + audit + outbox land together.
    await manager.run("commerce.test.commit", async (repos) => {
      await repos.orders.save({
        id: "ord_tx_commit",
        checkoutRef: "co_tx_commit",
        checkoutPublicToken: "tok_tx_commit_0123456789abcdef",
        status: "pending_payment",
        userId: null,
        customerEmail: "tx@example.com",
        customerName: null,
        delivery: null,
        currency: "IDR",
        totals: { subtotalAmount: 30000, shippingAmount: 0, discountAmount: 0, taxAmount: 0, grandTotalAmount: 30000 },
        totalAmount: 30000,
        shipping: { policy: "free_promotional", amount: 0 },
        lines: [],
        createdAt: now,
        updatedAt: now,
      });
      await repos.payments.save({
        id: "pay_tx_commit",
        orderId: "ord_tx_commit",
        provider: "xendit",
        providerSessionId: "ps_tx_commit",
        redirectUrl: "https://xen.to/tx",
        currency: "IDR",
        amount: 30000,
        status: "pending",
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await repos.audit.append({ action: "order.created", resourceType: "order", resourceId: "ord_tx_commit", actor: "system", occurredAt: now });
      await repos.outbox.enqueue({
        eventType: "order.created",
        aggregateType: "order",
        aggregateId: "ord_tx_commit",
        dedupeKey: "order:created:ord_tx_commit",
        payloadJson: "{}",
        availableAt: now,
      });
    });
    const committed = await manager.run("commerce.test.read", async (repos) => repos.orders.findById("ord_tx_commit"));
    assert.equal(committed.value?.status, "pending_payment");

    // Rolled-back unit: nothing lands, including the writes before the throw.
    await assert.rejects(
      manager.run("commerce.test.rollback", async (repos) => {
        await repos.orders.save({
          id: "ord_tx_rollback",
          checkoutRef: "co_tx_rollback",
          checkoutPublicToken: "tok_tx_rollback_0123456789abcd",
          status: "pending_payment",
          userId: null,
          customerEmail: "tx@example.com",
          customerName: null,
          delivery: null,
          currency: "IDR",
          totals: { subtotalAmount: 1, shippingAmount: 0, discountAmount: 0, taxAmount: 0, grandTotalAmount: 1 },
          totalAmount: 1,
          shipping: { policy: "free_promotional", amount: 0 },
          lines: [],
          createdAt: now,
          updatedAt: now,
        });
        await repos.audit.append({ action: "order.created", resourceType: "order", resourceId: "ord_tx_rollback", actor: "system", occurredAt: now });
        throw new Error("simulated crash mid-transaction");
      }),
      /simulated crash mid-transaction/,
    );
    const rolledBackOrder = await manager.run("commerce.test.read", async (repos) => repos.orders.findById("ord_tx_rollback"));
    assert.equal(rolledBackOrder.value, null);
    const rolledBackAudit = await database.client`SELECT 1 FROM audit_events WHERE resource_id = 'ord_tx_rollback'`;
    assert.equal(rolledBackAudit.length, 0, "audit writes roll back with the business state");
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
});

test("idempotency claim: concurrent identical claims yield exactly one claimed", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const bootstrap = postgres(testUrl, { max: 1 });
  await applyMigrations(bootstrap);
  await bootstrap.end();

  const database = createDatabase(testUrl);
  const standalone = new PostgresIdempotencyRepository(database);
  const claim = {
    scope: "checkout",
    principalKey: "guest-race",
    operation: "createFirstPartyCheckout",
    idempotencyKey: `race-${Date.now()}`,
    requestHash: "hash-race",
    createdAt: "2026-10-02T00:00:00.000Z",
  };

  try {
    const results = await Promise.all([standalone.claim(claim), standalone.claim({ ...claim })]);
    const statuses = results.map((result) => (result.ok ? result.value.status : "error")).sort();
    assert.deepEqual(statuses, ["claimed", "duplicate"]);

    const conflict = await standalone.claim({ ...claim, requestHash: "hash-other" });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error.code, "conflict");
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
});
