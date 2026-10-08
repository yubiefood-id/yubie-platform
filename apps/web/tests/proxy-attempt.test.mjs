import assert from "node:assert/strict";
import test from "node:test";
// Native TS type-stripping (node >= 22.18) imports the pure helpers directly.
import { forwardableProxyHeaders, nextAttemptKey } from "../lib/proxy-headers.ts";

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
