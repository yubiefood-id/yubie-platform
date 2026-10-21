import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";
import { createDatabase, closeDatabase } from "@yubie/persistence";
import { handleOpsPayments } from "../dist/ops-payments.js";

const ORIGINAL = {
  OPS_API_TOKEN: process.env.OPS_API_TOKEN,
  YUBIE_ENV: process.env.YUBIE_ENV,
  NODE_ENV: process.env.NODE_ENV,
};

function restoreEnv() {
  for (const [name, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function fakeDatabase(rows) {
  const calls = [];
  const client = async (strings, ...values) => {
    const sql = strings.join("?");
    if (sql.includes("SET LOCAL statement_timeout")) return [];
    calls.push({ sql, values });
    return rows;
  };
  client.begin = async (callback) => callback(client);
  return { database: { client }, calls };
}

test.afterEach(restoreEnv);

test("payment exception read model is authenticated, bounded, and excludes customer PII", async () => {
  process.env.OPS_API_TOKEN = "ops-test-token";
  process.env.YUBIE_ENV = "staging";
  process.env.NODE_ENV = "production";
  const { database, calls } = fakeDatabase([{
    payment_id: "pay_1",
    order_id: "ord_1",
    checkout_ref: "co_1",
    provider: "xendit",
    payment_status: "pending",
    order_status: "pending_payment",
    reconciliation_state: "ambiguous",
    amount: 35_000,
    order_total: 35_000,
    updated_at: "2026-10-20T10:00:00.000Z",
  }]);

  const unauthorized = await handleOpsPayments(
    new Request("https://api.yubiefood.com/ops/payments/exceptions"),
    database,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(calls.length, 0);
  let databaseCreated = false;
  const lazyUnauthorized = await handleOpsPayments(
    new Request("https://api.yubiefood.com/ops/payments/exceptions"),
    () => {
      databaseCreated = true;
      return database;
    },
  );
  assert.equal(lazyUnauthorized.status, 401);
  assert.equal(databaseCreated, false);

  const response = await handleOpsPayments(
    new Request("https://api.yubiefood.com/ops/payments/exceptions?limit=999", {
      headers: { authorization: "Bearer ops-test-token" },
    }),
    database,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].checkoutRef, "co_1");
  assert.equal("customerEmail" in payload.items[0], false);
  assert.equal(calls[0].values.at(-1), 101, "limit is capped at 100 plus lookahead");
});

test("payment exception cursor is fail-closed and parameterized", async () => {
  process.env.YUBIE_ENV = "test";
  process.env.NODE_ENV = "test";
  delete process.env.OPS_API_TOKEN;
  const { database, calls } = fakeDatabase([]);

  const invalid = await handleOpsPayments(
    new Request("https://api.yubiefood.com/ops/payments/exceptions?cursor=not-base64-json"),
    database,
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);

  const cursor = Buffer.from(JSON.stringify({
    updatedAt: "2026-10-20T10:00:00.000Z",
    id: "pay_1",
  })).toString("base64url");
  const response = await handleOpsPayments(
    new Request(`https://api.yubiefood.com/ops/payments/exceptions?cursor=${cursor}&limit=25`),
    database,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].values, ["2026-10-20T10:00:00.000Z", "pay_1", 26]);
});

test("payment exception read failures return a bounded unavailable response", async () => {
  process.env.YUBIE_ENV = "test";
  process.env.NODE_ENV = "test";
  delete process.env.OPS_API_TOKEN;
  const request = new Request("https://api.yubiefood.com/ops/payments/exceptions");

  const missingDatabase = await handleOpsPayments(request, null);
  assert.equal(missingDatabase.status, 503);

  const failingDatabase = {
    client: {
      begin: async () => {
        throw new Error("database detail must not escape");
      },
    },
  };
  const failed = await handleOpsPayments(request, failingDatabase, "req_ops_failure");
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "payment_exceptions_unavailable" });
});

test("real PostgreSQL exposes late captures and multiple charges in the queue and settlement metrics", { skip: !process.env.DATABASE_URL }, async () => {
  const admin = postgres(process.env.DATABASE_URL, { max: 1 });
  const name = `yubie_ops_qa_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  await admin`CREATE DATABASE ${admin(name)}`;
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${name}`;
  const database = createDatabase(testUrl.toString());
  try {
    const migrations = new URL("../../../packages/persistence/migrations/", import.meta.url);
    for (const file of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort()) {
      await database.client.unsafe(readFileSync(new URL(file, migrations), "utf8"));
    }
    for (const [id, paymentStatus, orderStatus, reason] of [
      ["late", "expired", "cancelled", "late_success_after_terminal"],
      ["multiple", "succeeded", "paid", "multiple_successful_transactions"],
    ]) {
      await database.client`INSERT INTO orders (id, checkout_ref, checkout_public_token, status, customer_email, currency, subtotal_amount, grand_total_amount, total_amount, created_at, updated_at)
        VALUES (${id}, ${`co_${id}`}, ${id.repeat(16)}, ${orderStatus}, 'synthetic@example.invalid', 'IDR', 35000, 35000, 35000, NOW(), NOW())`;
      await database.client`INSERT INTO order_payments (id, order_id, provider, status, amount, currency, reconciliation_state, created_at, updated_at)
        VALUES (${`pay_${id}`}, ${id}, 'ipaymu', ${paymentStatus}, 35000, 'IDR', ${reason}, NOW(), NOW())`;
    }
    process.env.YUBIE_ENV = "test";
    process.env.NODE_ENV = "test";
    delete process.env.OPS_API_TOKEN;
    const response = await handleOpsPayments(new Request("https://api.example.invalid/ops/payments/exceptions?limit=1"), database);
    const first = await response.json();
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const secondResponse = await handleOpsPayments(new Request(`https://api.example.invalid/ops/payments/exceptions?limit=1&cursor=${first.nextCursor}`), database);
    const second = await secondResponse.json();
    assert.deepEqual([...first.items, ...second.items].map((row) => row.reconciliationState).sort(), ["late_success_after_terminal", "multiple_successful_transactions"]);
    const { collectPaymentExceptionMetrics } = await import("../../worker/dist/payment-reconcile-handler.js");
    const { snapshotMetrics } = await import("../../worker/dist/metrics.js");
    await collectPaymentExceptionMetrics(database);
    assert.equal(snapshotMetrics().payment_settlement_exception_count, 2);
  } finally {
    await closeDatabase(database);
    await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;
    await admin.end();
  }
});
