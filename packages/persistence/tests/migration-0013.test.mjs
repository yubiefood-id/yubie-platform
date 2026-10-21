import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const skip = !databaseUrl;

async function withDatabase(work) {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_0013_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  await admin`CREATE DATABASE ${admin(dbName)}`;
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  try {
    await work(url.toString());
  } finally {
    await admin`DROP DATABASE ${admin(dbName)} WITH (FORCE)`;
    await admin.end();
  }
}

async function migrate(url, through) {
  const sql = postgres(url, { max: 1 });
  await sql`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (through && file > through) break;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(migrationsDir, file), "utf8"));
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
  return sql;
}

const EXPECTED_INDEXES = [
  "inventory_reservations_active_created",
  "order_payments_active_reconciliation",
  "order_payments_exception_cursor",
  "order_payments_pending_created",
  "webhook_inbox_payment_provider_received",
];

test("0013 installs payment observability indexes on a fresh database", { skip }, async () => {
  await withDatabase(async (url) => {
    const sql = await migrate(url);
    const rows = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY(${EXPECTED_INDEXES})
      ORDER BY indexname
    `;
    assert.deepEqual(rows.map((row) => row.indexname), EXPECTED_INDEXES);
    await sql.end();
  });
});

test("0012 to 0013 upgrade preserves existing payment rows", { skip }, async () => {
  await withDatabase(async (url) => {
    const sql = await migrate(url, "0012_guest_intent.sql");
    await sql`
      INSERT INTO orders (
        id, checkout_ref, checkout_public_token, status, customer_email, currency,
        subtotal_amount, grand_total_amount, total_amount, lines_jsonb, created_at, updated_at
      ) VALUES (
        'ord_0013', 'co_0013', 'tok_0013', 'pending_payment', 'migration@example.invalid', 'IDR',
        35000, 35000, 35000, '[]'::jsonb, NOW(), NOW()
      )
    `;
    await sql`
      INSERT INTO order_payments (
        id, order_id, provider, amount, status, created_at, updated_at
      ) VALUES ('pay_0013', 'ord_0013', 'ipaymu', 35000, 'pending', NOW(), NOW())
    `;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(migrationsDir, "0013_payment_observability.sql"), "utf8"));
      await tx`INSERT INTO schema_migrations (version) VALUES ('0013_payment_observability.sql')`;
    });
    const [payment] = await sql`SELECT id, amount, status FROM order_payments WHERE id = 'pay_0013'`;
    assert.deepEqual({ id: payment.id, amount: payment.amount, status: payment.status }, {
      id: "pay_0013",
      amount: 35000,
      status: "pending",
    });
    await sql.end();
  });
});

test("0013 to 0014 preserves commerce and adds hash-only staff revocations", { skip }, async () => {
  await withDatabase(async (url) => {
    const sql = await migrate(url, "0013_payment_observability.sql");
    try {
      const before = await sql`SELECT count(*)::int AS n FROM orders`;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(migrationsDir, "0014_admin_session_revocations.sql"), "utf8"));
        await tx`INSERT INTO schema_migrations (version) VALUES ('0014_admin_session_revocations.sql')`;
      });
      assert.deepEqual(await sql`SELECT count(*)::int AS n FROM orders`, before);
      const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'admin_session_revocations' ORDER BY ordinal_position`;
      assert.ok(columns.some((row) => row.column_name === "token_hash"));
      assert.equal(columns.some((row) => /secret|token$|credential|email/.test(row.column_name)), false);
      await assert.rejects(sql`INSERT INTO admin_session_revocations (token_hash, expires_at) VALUES ('raw-session-token', NOW())`, (error) => error.code === "23514");
      await sql`INSERT INTO admin_session_revocations (token_hash, expires_at) VALUES (${'a'.repeat(64)}, NOW() + INTERVAL '15 minutes')`;
      assert.equal((await sql`SELECT count(*)::int AS n FROM admin_session_revocations`)[0].n, 1);
    } finally { await sql.end(); }
  });
});
