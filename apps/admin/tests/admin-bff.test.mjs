import assert from "node:assert/strict";
import test from "node:test";
import { handleAdminRequest, issueAdminSession, REFINE_COMPATIBILITY_PIN } from "../dist/server.js";

const SECRET = "admin-session-test";
const NOW = Date.parse("2026-10-19T00:00:00.000Z");

function cookieFor(role) {
  const token = issueAdminSession({ sub: "op_1", role, exp: NOW + 60_000 }, SECRET);
  return `yubie_ops=${token}; yubie_ops_csrf=csrf-test`;
}

function call(path, { method = "GET", cookie = "", csrf = false } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-yubie-csrf"] = "csrf-test";
  return handleAdminRequest(new Request(`https://ops.internal${path}`, { method, headers }), {
    sessionSecret: SECRET,
    nowMs: NOW,
  });
}

test("health is public and reports that Refine is not installed", async () => {
  const response = await call("/healthz");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.deployed, false);
  assert.equal(body.data.refine, false);
  assert.equal(REFINE_COMPATIBILITY_PIN.installed, false);
  assert.equal(REFINE_COMPATIBILITY_PIN.react, "19.2.6");
});

test("anonymous and tampered sessions are denied", async () => {
  assert.equal((await call("/v1/orders")).status, 401);
  const forged = cookieFor("finance").replace("yubie_ops=", "yubie_ops=aaaa.");
  assert.equal((await call("/v1/orders", { cookie: forged })).status, 401);
});

test("viewer can read orders and cannot read payments or ERP", async () => {
  const cookie = cookieFor("viewer");
  assert.equal((await call("/v1/orders", { cookie })).status, 200);
  assert.equal((await call("/v1/payments", { cookie })).status, 403);
  assert.equal((await call("/v1/erp/stock", { cookie })).status, 403);
});

test("finance can read payments; writes stay denied after a matching CSRF token", async () => {
  const cookie = cookieFor("finance");
  const read = await call("/v1/payments", { cookie });
  assert.equal(read.status, 200);
  const text = await read.text();
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes("postgres"), false);
  assert.equal((await call("/v1/orders", { method: "POST", cookie, csrf: true })).status, 403);
  assert.equal((await call("/v1/orders", { method: "POST", cookie, csrf: false })).status, 403);
});

test("order pages come from the injected reader and reject an oversized limit", async () => {
  const cookie = cookieFor("viewer");
  const rows = [
    { id: "ord_1", checkoutRef: "co_1", status: "pending_payment", amount: 35000, currency: "IDR" },
    { id: "ord_2", checkoutRef: "co_2", status: "paid", amount: 29750, currency: "IDR" },
  ];
  const readers = {
    async listOrders(query) {
      assert.equal(query.limit, 1);
      const start = query.cursor === "1" ? 1 : 0;
      const items = rows.slice(start, start + query.limit);
      return { items, nextCursor: start + query.limit < rows.length ? String(start + query.limit) : null };
    },
    async listPayments() {
      throw new Error("viewer must not list payments");
    },
  };
  const first = await handleAdminRequest(new Request("https://ops.internal/v1/orders?limit=1", { headers: { cookie } }), {
    sessionSecret: SECRET,
    nowMs: NOW,
    readers,
  });
  const body = await first.json();
  assert.equal(body.data.source, "reader");
  assert.equal(body.data.orders.length, 1);
  assert.equal(body.data.orders[0].id, "ord_1");
  assert.equal(body.data.nextCursor, "1");
  const unconfigured = await call("/v1/orders", { cookie });
  assert.equal((await unconfigured.json()).data.source, "unconfigured");
  const invalid = await call("/v1/orders?limit=500", { cookie });
  assert.equal(invalid.status, 400);
});

test("a failing reader returns a bounded 503 without leaking the error", async () => {
  const response = await handleAdminRequest(new Request("https://ops.internal/v1/orders", { headers: { cookie: cookieFor("viewer") } }), {
    sessionSecret: SECRET,
    nowMs: NOW,
    readers: {
      async listOrders() { throw new Error("connect postgres://internal failed"); },
      async listPayments() { return { items: [], nextCursor: null }; },
    },
  });
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.equal(text.includes("postgres"), false);
  assert.equal(JSON.parse(text).code, "UNAVAILABLE");
});

test("a state-changing request without CSRF is rejected before a viewer write", async () => {
  const response = await call("/v1/orders", { method: "POST", cookie: cookieFor("finance") });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "CSRF");
});
