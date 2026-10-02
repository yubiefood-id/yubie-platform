import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;

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

async function assertAuthAndOrderTables(sql) {
  const users = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY column_name
  `;
  assert.ok(users.some((row) => row.column_name === "google_sub"));

  const sessions = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'auth_sessions' ORDER BY column_name
  `;
  assert.ok(sessions.some((row) => row.column_name === "token_hash"));
  assert.ok(sessions.some((row) => row.column_name === "revoked_at"));

  const orders = await sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' ORDER BY column_name
  `;
  assert.ok(orders.some((row) => row.column_name === "checkout_ref"));
  assert.ok(orders.some((row) => row.column_name === "total_amount"));
  assert.ok(orders.some((row) => row.column_name === "delivery_jsonb"));

  for (const table of ["order_payments", "payment_events"]) {
    const exists = await sql`SELECT 1 FROM information_schema.tables WHERE table_name = ${table}`;
    assert.equal(exists.length, 1);
  }

  const dedupeIndex = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'payment_events' AND indexname = 'payment_events_dedupe'
  `;
  assert.equal(dedupeIndex.length, 1);

  const uniqueSub = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_google_sub'
  `;
  assert.equal(uniqueSub.length, 1);
}

test("migrations 0006+0007 fresh database creates auth and order tables", { skip: !databaseUrl }, async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await applyMigrations(sql, "0007_orders.sql");
    await assertAuthAndOrderTables(sql);
  } finally {
    await sql.end();
  }
});

test("migrations 0006+0007 upgrade preserves existing orders data", { skip: !databaseUrl }, async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const checkoutRef = `upgrade-proof-${Date.now()}`;
  const now = new Date().toISOString();
  try {
    await applyMigrations(sql, "0007_orders.sql");
    await sql`
      INSERT INTO users (id, google_sub, email, name, created_at, updated_at)
      VALUES ('usr-proof', 'proof-sub', 'proof@example.com', 'Proof', ${now}, ${now})
    `;
    await sql`
      INSERT INTO orders (id, checkout_ref, status, user_id, customer_email, total_amount, created_at, updated_at)
      VALUES ('ord-proof', ${checkoutRef}, 'paid', 'usr-proof', 'proof@example.com', 30000, ${now}, ${now})
    `;
    await applyMigrations(sql, "0007_orders.sql");
    const orders = await sql`SELECT status, total_amount FROM orders WHERE checkout_ref = ${checkoutRef}`;
    assert.equal(orders[0]?.status, "paid");
    assert.equal(orders[0]?.total_amount, 30000);
    await assertAuthAndOrderTables(sql);
  } finally {
    await sql.end();
  }
});
