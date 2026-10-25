import assert from "node:assert/strict";
import test from "node:test";
// Native TS type-stripping (node >= 22.18) imports the pure helpers directly.
import { attemptKeyForCart, attemptOutcomeForHttpStatus, classifyCheckoutResponse, forwardableProxyHeaders, customerProxyHeaders, nextAttemptKey } from "../lib/proxy-headers.ts";
import {storedAttemptForRequest} from "../lib/proxy-headers.ts";
import * as attemptHelpers from "../lib/proxy-headers.ts";

test("authoritative recovery can continue when browser pointer storage is corrupt or unavailable",()=>{
 assert.equal(typeof attemptHelpers.rememberRecoveredCheckout,"function");
 for(const storage of [
  {getItem:()=>"{broken",setItem:()=>{}},
  {getItem:()=>{throw new Error("SecurityError");},setItem:()=>{throw new Error("QuotaExceeded");}},
 ])assert.doesNotThrow(()=>attemptHelpers.rememberRecoveredCheckout(storage,"a".repeat(32)));
});

test("an unresolved stored attempt cannot be replaced by editing checkout details",async()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const first=await storedAttemptForRequest(storage,"original",crypto.randomUUID());
 await assert.rejects(()=>storedAttemptForRequest(storage,"changed",crypto.randomUUID()),/unresolved/);
 assert.equal(JSON.parse([...values.values()][0]).key,first.key);
});

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
  for (const status of [408, 409, 429, 500, 502, 503, 504]) {
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
  for (const status of [408, 429, 500, 502, 504]) assert.equal(classifyCheckoutResponse(status, null), "pending", String(status));
  assert.equal(classifyCheckoutResponse(409, { code: "INSUFFICIENT_INVENTORY" }), "sold_out");
  assert.equal(classifyCheckoutResponse(409, { code: "UNAVAILABLE_LINE" }), "sold_out");
  assert.equal(classifyCheckoutResponse(400, { code: "INVALID_REQUEST" }), "invalid");
  assert.equal(classifyCheckoutResponse(201, { data: { mode: "live" } }), "failed", "a 201 without a redirect is not a success");
});

test("disabled admission never tells a customer that a payment is pending", () => {
  assert.equal(classifyCheckoutResponse(503, { code: "CHECKOUT_DISABLED" }), "unavailable");
  assert.equal(classifyCheckoutResponse(503, { code: "SHIPPING_UNAVAILABLE" }), "unavailable");
});

test("login return path cannot become an external or script navigation", async () => {
  const { safeLoginReturnPath } = await import("../lib/login-return.ts");
  for (const value of ["https://evil.example", "//evil.example/path", "/\\evil.example", "/\n/evil.example", "javascript:alert(1)", "", null]) assert.equal(safeLoginReturnPath(value), "/account");
  assert.equal(safeLoginReturnPath("/account/orders?status=paid#latest"), "/account/orders?status=paid#latest");
});


test("customer proxy binds origin and CSRF while trusting only configured Cloudflare ingress IP", () => {
 const request=new Request('https://shop.test/api/auth/phone/challenges',{headers:{origin:'https://shop.test','x-csrf-token':'a'.repeat(64),'cf-connecting-ip':'203.0.113.10','x-yubie-client-ip':'attacker','x-yubie-browser-origin':'https://attacker.invalid'}});
 assert.equal(customerProxyHeaders(request,false)['x-yubie-client-ip'],undefined);
 const safe=customerProxyHeaders(request,true);
 assert.equal(safe['x-yubie-client-ip'],'203.0.113.10');
 assert.equal(safe['x-yubie-browser-origin'],'https://shop.test');
 assert.equal(safe['x-csrf-token'],'a'.repeat(64));
});
