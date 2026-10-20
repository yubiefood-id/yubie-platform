import assert from "node:assert/strict";
import test from "node:test";
// Native TS type-stripping (node >= 22.18) imports the pure helpers directly.
import { attemptKeyForCart, attemptOutcomeForHttpStatus, classifyCheckoutResponse, forwardableProxyHeaders, nextAttemptKey } from "../lib/proxy-headers.ts";

test("the proxy forwards ONLY the allowlisted browser headers", () => {
  const headers = new Headers({
    "content-type": "application/json",
    "idempotency-key": "attempt-1",
    "x-request-id": "req_abc-123",
    "x-forwarded-for": "1.2.3.4",
    authorization: "Bearer should-not-travel",
    cookie: "yubie_session=abc",
    "user-agent": "curl/8",
    "x-custom": "nope",
  });
  const forwarded = forwardableProxyHeaders(headers);
  assert.deepEqual(Object.keys(forwarded).sort(), ["idempotency-key", "x-request-id"]);
  assert.equal(forwarded["idempotency-key"], "attempt-1");
});

test("oversized or malformed forwarded values are dropped, not truncated", () => {
  const tooLong = new Headers({ "idempotency-key": "k".repeat(129) });
  assert.deepEqual(forwardableProxyHeaders(tooLong), {});

  const badRequestId = new Headers({ "x-request-id": "id with spaces and symbols!!" });
  assert.deepEqual(forwardableProxyHeaders(badRequestId), {});

  const empty = new Headers();
  assert.deepEqual(forwardableProxyHeaders(empty), {});
});

test("one logical checkout attempt keeps ONE key across ambiguous retries", () => {
  const fresh = () => crypto.randomUUID();

  // First submit: no previous key, outcome unknown until the server answers.
  const first = nextAttemptKey(null, "ambiguous", fresh());
  assert.ok(first, "first attempt gets a key");

  // Network-ambiguous retry REUSES the same key — never a fresh UUID.
  const retry = nextAttemptKey(first, "ambiguous", fresh());
  assert.equal(retry, first);

  // Any definitive HTTP response closes the attempt.
  assert.equal(nextAttemptKey(first, "definitive", fresh()), null);
  // A material cart change voids the attempt.
  assert.equal(nextAttemptKey(first, "reset", fresh()), null);
  // A new attempt after closure starts fresh.
  const renewed = nextAttemptKey(nextAttemptKey(first, "definitive", fresh()), "ambiguous", fresh());
  assert.ok(renewed && renewed !== first, "closed attempt rotates to a new key");
});

test("gateway and conflict HTTP statuses keep the same attempt key", () => {
  const key = "attempt-gateway";
  for (const status of [408, 409, 429, 502, 503, 504]) {
    assert.equal(attemptOutcomeForHttpStatus(status), "ambiguous");
    assert.equal(nextAttemptKey(key, attemptOutcomeForHttpStatus(status), "fresh"), key);
  }
  assert.equal(attemptOutcomeForHttpStatus(201), "definitive");
  assert.equal(attemptOutcomeForHttpStatus(400), "definitive");
  assert.equal(nextAttemptKey(key, attemptOutcomeForHttpStatus(201), "fresh"), null);
});

test("a held attempt key is reused only for the same cart; a changed cart starts a new attempt", () => {
  const held = { key: "attempt-a", fingerprint: "cart-1" };
  assert.deepEqual(attemptKeyForCart(held, "cart-1", "fresh"), held);
  assert.deepEqual(attemptKeyForCart(held, "cart-2", "fresh"), { key: "fresh", fingerprint: "cart-2" });
  assert.deepEqual(attemptKeyForCart(null, "cart-1", "fresh"), { key: "fresh", fingerprint: "cart-1" });
});

test("checkout responses map to UI outcomes; errors never fall back to preview", () => {
  assert.equal(classifyCheckoutResponse(201, { data: { mode: "live", redirectUrl: "https://pay.example/x" } }), "redirect");
  assert.equal(classifyCheckoutResponse(202, { data: { status: "preview" } }), "preview");
  for (const code of ["PENDING_RECONCILIATION", "PROVIDER_UNAVAILABLE", "API_TIMEOUT", "IDEMPOTENCY_KEY_REUSED"]) {
    assert.equal(classifyCheckoutResponse(503, { code }), "pending", code);
  }
  for (const status of [408, 429, 502, 504]) assert.equal(classifyCheckoutResponse(status, null), "pending", String(status));
  assert.equal(classifyCheckoutResponse(409, { code: "INSUFFICIENT_INVENTORY" }), "sold_out");
  assert.equal(classifyCheckoutResponse(409, { code: "UNAVAILABLE_LINE" }), "sold_out");
  assert.equal(classifyCheckoutResponse(400, { code: "INVALID_REQUEST" }), "invalid");
  assert.equal(classifyCheckoutResponse(500, null), "failed");
  assert.equal(classifyCheckoutResponse(201, { data: { mode: "live" } }), "failed", "a 201 without a redirect is not a success");
});
