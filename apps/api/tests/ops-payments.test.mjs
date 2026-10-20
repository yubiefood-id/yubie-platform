import assert from "node:assert/strict";
import test from "node:test";
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
    new Request("https://api.yubie.id/ops/payments/exceptions"),
    database,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(calls.length, 0);
  let databaseCreated = false;
  const lazyUnauthorized = await handleOpsPayments(
    new Request("https://api.yubie.id/ops/payments/exceptions"),
    () => {
      databaseCreated = true;
      return database;
    },
  );
  assert.equal(lazyUnauthorized.status, 401);
  assert.equal(databaseCreated, false);

  const response = await handleOpsPayments(
    new Request("https://api.yubie.id/ops/payments/exceptions?limit=999", {
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
    new Request("https://api.yubie.id/ops/payments/exceptions?cursor=not-base64-json"),
    database,
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);

  const cursor = Buffer.from(JSON.stringify({
    updatedAt: "2026-10-20T10:00:00.000Z",
    id: "pay_1",
  })).toString("base64url");
  const response = await handleOpsPayments(
    new Request(`https://api.yubie.id/ops/payments/exceptions?cursor=${cursor}&limit=25`),
    database,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].values, ["2026-10-20T10:00:00.000Z", "pay_1", 26]);
});

test("payment exception read failures return a bounded unavailable response", async () => {
  process.env.YUBIE_ENV = "test";
  process.env.NODE_ENV = "test";
  delete process.env.OPS_API_TOKEN;
  const request = new Request("https://api.yubie.id/ops/payments/exceptions");

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
