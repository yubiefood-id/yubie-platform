import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { GoogleIdTokenVerifier } from "@yubie/integrations";
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

test("health reports the installed UI without claiming remote deployment", async () => {
  const response = await call("/healthz");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.deployed, false);
  assert.equal(body.data.refine, true);
  assert.equal(REFINE_COMPATIBILITY_PIN.installed, true);
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

test("staff login requires same-origin CSRF, a verified subject and a server-owned role", async () => {
  const options = {
    sessionSecret: SECRET, nowMs: NOW,
    googleClientId: "staff-client",
    staffRoles: { staff_subject: "viewer" },
    verifier: { async verify() { return { ok: true, value: { sub: "staff_subject", emailVerified: true } }; } },
  };
  const config = await handleAdminRequest(new Request("https://ops.internal/auth/config"), options);
  assert.equal(config.status, 200);
  const { data } = await config.json();
  assert.equal(data.googleClientId, "staff-client");
  const csrfCookie = config.headers.get("set-cookie").split(";")[0];
  const login = (headers) => handleAdminRequest(new Request("https://ops.internal/auth/google", {
    method: "POST", headers: { "content-type": "application/json", cookie: csrfCookie, ...headers },
    body: JSON.stringify({ credential: "verified-at-port", role: "finance" }),
  }), options);
  assert.equal((await login({})).status, 403);
  assert.equal((await login({ origin: "https://evil.example", "x-yubie-csrf": data.csrfToken })).status, 403);
  const response = await login({ origin: "https://ops.internal", "x-yubie-csrf": data.csrfToken });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /Secure/);
  const session = await handleAdminRequest(new Request("https://ops.internal/auth/session", { headers: { cookie: response.headers.get("set-cookie").split(";")[0] } }), options);
  assert.equal((await session.json()).data.role, "viewer");
});

test("staff removal immediately invalidates an otherwise signed session", async () => {
  const response = await handleAdminRequest(new Request("https://ops.internal/v1/orders", { headers: { cookie: cookieFor("viewer") } }), {
    sessionSecret: SECRET, nowMs: NOW, staffRoles: { another_staff: "viewer" },
  });
  assert.equal(response.status, 403);
});

test("an audit failure prevents disclosure of payment rows", async () => {
  const response = await handleAdminRequest(new Request("https://ops.internal/v1/payments", { headers: { cookie: cookieFor("finance") } }), {
    sessionSecret: SECRET, nowMs: NOW,
    readers: { async listOrders() { return { items: [], nextCursor: null }; }, async listPayments() { return { items: [{ id: "must-not-escape" }], nextCursor: null }; } },
    audit: { async append() { throw new Error("test audit outage"); } },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("must-not-escape"), false);
});

test("malformed session-cookie encoding is an anonymous request, never an exception", async () => {
  const response = await call("/v1/orders", { cookie: "yubie_ops=%ZZ" });
  assert.equal(response.status, 401);
});

test("staff exchange verifies RSA signature, issuer, staff audience, expiry and allowlisted subject", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const verifier = new GoogleIdTokenVerifier({ clientId: "separate-staff-client", now: () => NOW, fetchFn: async () => ({ ok: true, json: async () => ({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "staff-test" }] }) }) });
  const options = { sessionSecret: SECRET, nowMs: NOW, googleClientId: "separate-staff-client", verifier, staffRoles: { staff_subject: "operator" } };
  const payload = { iss: "https://accounts.google.com", aud: "separate-staff-client", sub: "staff_subject", exp: NOW / 1000 + 60, email_verified: true };
  for (const [patch, expected] of [[{ aud: "customer-client" }, 401], [{ iss: "https://evil.example" }, 401], [{ exp: NOW / 1000 - 1 }, 401], [{ sub: "unapproved_staff" }, 403], [{ email_verified: false }, 403], [{}, 200]]) {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "staff-test" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ ...payload, ...patch })).toString("base64url");
    const credential = `${header}.${body}.${sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url")}`;
    const response = await handleAdminRequest(new Request("https://ops.internal/auth/google", { method: "POST", headers: { origin: "https://ops.internal", cookie: "yubie_ops_csrf=synthetic-csrf", "x-yubie-csrf": "synthetic-csrf" }, body: JSON.stringify({ credential }) }), options);
    assert.equal(response.status, expected);
    if (expected !== 200) assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("logout revokes a staff token so replay fails even before its signed expiry", async () => {
  const revoked = new Set();
  const options = { sessionSecret: SECRET, nowMs: NOW, sessions: { async isRevoked(hash) { return revoked.has(hash); }, async revoke(input) { revoked.add(input.tokenHash); } } };
  const cookie = cookieFor("operator");
  const response = await handleAdminRequest(new Request("https://ops.internal/auth/logout", { method: "POST", headers: { cookie, origin: "https://ops.internal", "x-yubie-csrf": "csrf-test" } }), options);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await handleAdminRequest(new Request("https://ops.internal/auth/session", { headers: { cookie } }), options)).status, 401);
});
