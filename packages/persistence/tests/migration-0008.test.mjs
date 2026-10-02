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
import {
  PostgresPaymentWebhookInboxRepository,
  PostgresTransactionManager,
  closeDatabase,
  createDatabase,
} from "../dist/index.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;

async function createIsolatedDatabase() {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_0008_test_${String(Date.now())}_${Math.floor(Math.random() * 10000)}`;
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

async function applyMigrations(sql, throughFile) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (throughFile && file > throughFile) break;
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
}

async function assertCommerceHardening(sql) {
  const orderColumns = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'`).map((row) => row.column_name);
  for (const column of ["checkout_public_token", "subtotal_amount", "shipping_amount", "discount_amount", "tax_amount", "grand_total_amount", "shipping_jsonb"]) {
    assert.ok(orderColumns.includes(column), `orders.${column} exists`);
  }
  const paymentColumns = (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'order_payments'`).map((row) => row.column_name);
  for (const column of ["provider_business_id", "provider_payment_id", "reconciliation_state"]) {
    assert.ok(paymentColumns.includes(column), `order_payments.${column} exists`);
  }
  const sessionNullable = await sql`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'order_payments' AND column_name = 'provider_session_id'`;
  assert.equal(sessionNullable[0].is_nullable, "YES", "payment intents may exist before the provider session");

  const tokenIndex = await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname = 'orders_checkout_public_token'`;
  assert.equal(tokenIndex.length, 1);
  const partialUnique = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'order_payments' AND indexname = 'order_payments_provider_session'`;
  assert.match(partialUnique[0].indexdef, /WHERE \(?provider_session_id IS NOT NULL\)?/i);
  const idemColumn = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'idempotency_keys' AND column_name = 'response_json'`;
  assert.equal(idemColumn.length, 1);

  // Totals integrity constraint rejects inconsistent amounts.
  const now = new Date().toISOString();
  await sql`
    INSERT INTO users (id, google_sub, email, name, created_at, updated_at)
    VALUES ('usr-check', 'check-sub', 'check@example.com', 'Check', ${now}, ${now})
    ON CONFLICT DO NOTHING
  `;
  await assert.rejects(
    sql`
      INSERT INTO orders (id, checkout_ref, checkout_public_token, status, customer_email, subtotal_amount, shipping_amount, tax_amount, discount_amount, grand_total_amount, total_amount, created_at, updated_at)
      VALUES ('ord-check-bad', 'co-bad', 'tokbad', 'draft', 'check@example.com', 1000, 0, 0, 0, 999, 999, ${now}, ${now})
    `,
    /orders_grand_total_check/,
  );
}

test("migration 0008 fresh database creates the commerce-hardening schema", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const sql = postgres(testUrl, { max: 1 });
  try {
    await applyMigrations(sql);
    await assertCommerceHardening(sql);
  } finally {
    await sql.end();
    await dropIsolatedDatabase(dbName);
  }
});

test("migration 0008 upgrade preserves and backfills legacy orders", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const sql = postgres(testUrl, { max: 1 });
  const now = new Date().toISOString();
  const checkoutRef = `legacy-${Date.now()}`;
  try {
    await applyMigrations(sql, "0007_orders.sql");
    await sql`
      INSERT INTO orders (id, checkout_ref, status, customer_email, total_amount, lines_jsonb, created_at, updated_at)
      VALUES ('ord-legacy', ${checkoutRef}, 'paid', 'legacy@example.com', 28000, '[]', ${now}, ${now})
    `;
    await applyMigrations(sql);
    await assertCommerceHardening(sql);

    const rows = await sql`SELECT checkout_public_token, subtotal_amount, grand_total_amount, total_amount, shipping_jsonb FROM orders WHERE checkout_ref = ${checkoutRef}`;
    const row = rows[0];
    assert.match(row.checkout_public_token, /^[0-9a-f]{32}$/, "legacy order gets an opaque token");
    assert.equal(row.subtotal_amount, 28000);
    assert.equal(row.grand_total_amount, 28000);
    assert.equal(row.total_amount, 28000);
    assert.equal(row.shipping_jsonb.policy, "free_promotional");
  } finally {
    await sql.end();
    await dropIsolatedDatabase(dbName);
  }
});

function makeStubProvider() {
  return {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      return { ok: true, value: { provider: "xendit", providerSessionId: `ps_${input.referenceId}`, redirectUrl: "https://xen.to/0008", rawStatus: "ACTIVE", expiresAt: "2026-01-02T00:00:00.000Z" } };
    },
    async getPaymentSession(providerSessionId) {
      return { ok: true, value: { provider: "xendit", providerSessionId, redirectUrl: "https://xen.to/0008", rawStatus: "COMPLETED", expiresAt: null } };
    },
    async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
  };
}

test("checkout saga and webhook are atomic and exactly-once on real PostgreSQL", { skip: !databaseUrl }, async () => {
  const { testUrl, dbName } = await createIsolatedDatabase();
  const bootstrap = postgres(testUrl, { max: 1 });
  await applyMigrations(bootstrap);
  await bootstrap.end();

  const database = createDatabase(testUrl);
  const tx = new PostgresTransactionManager(database);
  const provider = makeStubProvider();
  const clock = new FixedClock("2026-10-02T00:00:00.000Z");
  const ids = new SequentialIdGenerator();
  const deps = { tx, provider, clock, ids };

  try {
    const input = {
      lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }],
      customerEmail: "pg@example.com",
      customerName: "PG Test",
      successReturnUrl: "https://yubie.id/checkout/success",
      cancelReturnUrl: "https://yubie.id/checkout/cancel",
      idempotencyPrincipal: "guest",
      rawRequestBody: JSON.stringify({ lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }] }),
    };

    // Idempotent replay against the real unique index: same response, one session.
    const first = await createFirstPartyCheckout({ ...input, idempotencyKey: "pg-idem-1" }, deps);
    assert.equal(first.ok, true);
    const replay = await createFirstPartyCheckout({ ...input, idempotencyKey: "pg-idem-1" }, deps);
    assert.equal(replay.ok, true);
    assert.deepEqual(replay.value, first.value);
    assert.equal(provider.created.length, 1);

    // Draft + pending_payment rows carry audit and outbox in the same commit.
    const auditRows = await database.client`SELECT 1 FROM audit_events WHERE resource_id = (SELECT id FROM orders WHERE checkout_public_token = ${first.value.checkoutToken})`;
    assert.equal(auditRows.length, 2, "draft_created + pending_payment audit rows committed");
    const outboxRows = await database.client`SELECT 1 FROM outbox_events WHERE aggregate_id = (SELECT id FROM orders WHERE checkout_public_token = ${first.value.checkoutToken})`;
    assert.ok(outboxRows.length >= 2);

    // Verified webhook transitions to paid exactly once, with inbox + event rows.
    const webhookInput = {
      callbackToken: "token",
      expectedToken: "token",
      expectedBusinessId: "biz-1",
      payload: {
        event: "payment_session.completed",
        business_id: "biz-1",
        created: "2026-10-02T01:00:00Z",
        data: {
          payment_session_id: `ps_${first.value.checkoutRef}`,
          reference_id: first.value.checkoutRef,
          status: "COMPLETED",
          currency: "IDR",
          amount: first.value.totalAmount,
          payment_id: "pay_pg_1",
        },
      },
    };
    const applied = await processPaymentWebhook(webhookInput, { tx, clock, ids });
    assert.deepEqual(applied, { result: "applied", paymentStatus: "succeeded" });
    const duplicate = await processPaymentWebhook(webhookInput, { tx, clock, ids });
    assert.equal(duplicate.result, "duplicate");

    const paid = await database.client`SELECT status FROM orders WHERE checkout_public_token = ${first.value.checkoutToken}`;
    assert.equal(paid[0].status, "paid");
    const inboxRows = await database.client`SELECT status FROM webhook_inbox WHERE provider = 'xendit_payment_session' AND delivery_id = ${`ps_${first.value.checkoutRef}:payment_session.completed:pay_pg_1`}`;
    assert.equal(inboxRows.length, 1);
    assert.equal(inboxRows[0].status, "processed");

    // Provider failure path: draft cancelled atomically, no session anywhere.
    provider.createPaymentSession = async () => ({ ok: false, error: { code: "unavailable", message: "down", retryable: true, requestId: "x" } });
    const failed = await createFirstPartyCheckout({ ...input, idempotencyKey: "pg-idem-2", customerEmail: "fail@example.com" }, deps);
    assert.equal(failed.ok, false);
    const failedPayments = await database.client`SELECT p.status, p.provider_session_id, p.reconciliation_state FROM order_payments p JOIN orders o ON o.id = p.order_id WHERE o.customer_email = 'fail@example.com'`;
    assert.equal(failedPayments[0].status, "failed");
    assert.equal(failedPayments[0].provider_session_id, null);
    assert.equal(failedPayments[0].reconciliation_state, "provider_create_failed");
    const cancelledOrder = await database.client`SELECT status FROM orders WHERE customer_email = 'fail@example.com'`;
    assert.equal(cancelledOrder[0].status, "cancelled");
  } finally {
    await closeDatabase(database);
    await dropIsolatedDatabase(dbName);
  }
});
