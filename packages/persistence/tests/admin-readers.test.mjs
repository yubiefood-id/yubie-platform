import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";
import { PostgresAdminReaders, closeDatabase, createDatabase } from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const skip = !databaseUrl;

async function withMigratedDatabase(work) {
  const admin = postgres(databaseUrl, { max: 1 });
  const dbName = `yubie_admin_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  await admin`CREATE DATABASE ${admin(dbName)}`;
  const url = new URL(databaseUrl);
  url.pathname = `/${dbName}`;
  const sql = postgres(url.toString(), { max: 1 });
  try {
    await sql`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(migrationsDir, file), "utf8"));
        await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      });
    }
    await work(sql, url.toString());
  } finally {
    await sql.end();
    await admin`DROP DATABASE ${admin(dbName)} WITH (FORCE)`;
    await admin.end();
  }
}

test("admin readers page orders and payments without customer PII", { skip }, async () => {
  await withMigratedDatabase(async (sql, url) => {
    const sameInstant = "2026-10-20T10:00:00.123456Z";
    const orders = [
      ["ord_a", sameInstant],
      ["ord_b", sameInstant],
      ["ord_c", "2026-10-20T09:00:00.000001Z"],
    ];
    for (const [id, createdAt] of orders) {
      await sql`
        INSERT INTO orders (id, checkout_ref, checkout_public_token, customer_email, customer_name,
          subtotal_amount, discount_amount, grand_total_amount, total_amount, created_at, updated_at)
        VALUES (${id}, ${`co_${id}`}, ${`tok_${id}`}, 'buyer@example.com', 'Buyer Name',
          35000, 5250, 29750, 29750, ${createdAt}, ${createdAt})`;
      await sql`
        INSERT INTO order_payments (id, order_id, provider, amount, reconciliation_state, created_at, updated_at)
        VALUES (${`pay_${id}`}, ${id}, 'ipaymu', 29750, ${id === "ord_b" ? "ambiguous" : null}, ${createdAt}, ${createdAt})`;
    }

    const database = createDatabase(url);
    try {
      const readers = new PostgresAdminReaders(database);
      const seen = [];
      let cursor = null;
      for (let page = 0; page < 5; page += 1) {
        const result = await readers.listOrders({ limit: 2, cursor });
        seen.push(...result.items.map((item) => item.id));
        for (const item of result.items) {
          assert.deepEqual(Object.keys(item).sort(), ["amount", "checkoutRef", "currency", "id", "status"]);
          assert.equal(item.amount, 29750, "admin shows the charged grand total");
        }
        assert.equal(JSON.stringify(result).includes("buyer@example.com"), false);
        if (result.nextCursor) assert.match(result.nextCursor, /^[A-Za-z0-9_-]{1,80}$/);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(seen, ["ord_b", "ord_a", "ord_c"], "ties on created_at break by id without skips or repeats");

      const payments = await readers.listPayments({ limit: 50, cursor: null });
      assert.equal(payments.items.length, 3);
      assert.equal(payments.nextCursor, null);
      assert.equal(payments.items.find((item) => item.id === "pay_ord_b").reconciliationState, "ambiguous");
      assert.equal(payments.items.find((item) => item.id === "pay_ord_a").reconciliationState, "none");

      await assert.rejects(readers.listOrders({ limit: 2, cursor: "not-a-cursor" }), RangeError);
    } finally {
      await closeDatabase(database);
    }
  });
});
