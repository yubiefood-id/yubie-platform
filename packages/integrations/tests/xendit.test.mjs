import assert from "node:assert/strict";
import test from "node:test";
import { XenditPaymentProvider } from "../dist/index.js";

function makeProvider(responses) {
  const calls = [];
  const fetchFn = async (input, init) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (!next) throw new Error("no canned response");
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.json,
    };
  };
  return { provider: new XenditPaymentProvider({ secretKey: "test-secret", apiBaseUrl: "https://xendit.test", fetchFn }), calls };
}

const SESSION_INPUT = {
  referenceId: "co_1",
  amount: 30000,
  currency: "IDR",
  customerEmail: "customer@example.com",
  description: "Yubie order co_1",
  successReturnUrl: "https://yubie.id/checkout/success",
  cancelReturnUrl: "https://yubie.id/checkout/cancel",
  items: [{ referenceId: "flour-250g", name: "Yubie Flour 250 g", quantity: 2, netUnitAmount: 15000 }],
};

const SESSION_RESPONSE = {
  payment_session_id: "ps-661f87c614802d6c402cd82d",
  payment_link_url: "https://xen.to/abc",
  status: "ACTIVE",
  expires_at: "2026-01-02T00:00:00Z",
  business_id: "biz-1",
};

test("create session sends the official /sessions contract (mode + category are required fields)", async () => {
  const { provider, calls } = makeProvider([{ json: SESSION_RESPONSE }]);
  const result = await provider.createPaymentSession(SESSION_INPUT);
  assert.equal(result.ok, true);
  assert.equal(result.value.provider, "xendit");
  assert.equal(result.value.providerSessionId, "ps-661f87c614802d6c402cd82d");
  assert.equal(result.value.redirectUrl, "https://xen.to/abc");
  assert.equal(result.value.rawStatus, "ACTIVE");
  assert.equal(result.value.providerBusinessId, "biz-1");

  const call = calls[0];
  assert.equal(call.input, "https://xendit.test/sessions");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.authorization, `Basic ${Buffer.from("test-secret:").toString("base64")}`);
  // The current official Payments API does not use an api-version header.
  assert.equal(call.init.headers["x-api-version"], undefined);
  const body = JSON.parse(call.init.body);
  assert.equal(body.reference_id, "co_1");
  assert.equal(body.session_type, "PAY");
  assert.equal(body.mode, "PAYMENT_LINK");
  assert.equal(body.country, "ID");
  assert.equal(body.currency, "IDR");
  assert.equal(body.capture_method, "AUTOMATIC");
  assert.equal(body.locale, "id");
  assert.equal(body.success_return_url, "https://yubie.id/checkout/success");
  assert.equal(body.cancel_return_url, "https://yubie.id/checkout/cancel");
  assert.deepEqual(body.items[0], {
    reference_id: "flour-250g",
    name: "Yubie Flour 250 g",
    type: "PHYSICAL_PRODUCT",
    category: "food",
    quantity: 2,
    net_unit_amount: 15000,
    currency: "IDR",
  });
});

test("create session passes expires_at only when provided", async () => {
  const { provider, calls } = makeProvider([{ json: SESSION_RESPONSE }]);
  await provider.createPaymentSession({ ...SESSION_INPUT, expiresAt: "2026-10-03T00:00:00Z" });
  assert.equal(JSON.parse(calls[0].init.body).expires_at, "2026-10-03T00:00:00Z");

  const bare = makeProvider([{ json: SESSION_RESPONSE }]);
  await bare.provider.createPaymentSession(SESSION_INPUT);
  assert.equal(JSON.parse(bare.calls[0].init.body).expires_at, undefined);
});

test("provider failures surface as unavailable errors, never fake sessions", async () => {
  const { provider } = makeProvider([{ ok: false, status: 400, json: { error_code: "API_VALIDATION_ERROR" } }]);
  const result = await provider.createPaymentSession(SESSION_INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");

  const missing = makeProvider([{ json: {} }]);
  const bad = await missing.provider.createPaymentSession(SESSION_INPUT);
  assert.equal(bad.ok, false);
});

test("get session uses GET /sessions/{id} and maps official statuses", async () => {
  const okProvider = makeProvider([{ json: { ...SESSION_RESPONSE, status: "COMPLETED", payment_id: "pay_123" } }]);
  const found = await okProvider.provider.getPaymentSession("ps-661f87c614802d6c402cd82d");
  assert.equal(found.ok, true);
  assert.equal(found.value.rawStatus, "COMPLETED");
  assert.equal(found.value.providerPaymentId, "pay_123");
  assert.equal(okProvider.calls[0].input, "https://xendit.test/sessions/ps-661f87c614802d6c402cd82d");
  assert.equal(okProvider.calls[0].init.method, "GET");
  assert.equal(okProvider.calls[0].init.body, undefined);

  const missing = makeProvider([{ ok: false, status: 404, json: {} }]);
  const notFound = await missing.provider.getPaymentSession("ps_none");
  assert.equal(notFound.ok, true);
  assert.equal(notFound.value, null);
});

test("cancel session posts to /sessions/{id}/cancel without a body", async () => {
  const { provider, calls } = makeProvider([{ json: { ...SESSION_RESPONSE, status: "CANCELED" } }]);
  const cancelled = await provider.cancelPaymentSession("ps-661f87c614802d6c402cd82d");
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.value.accepted, true);
  assert.equal(calls[0].input, "https://xendit.test/sessions/ps-661f87c614802d6c402cd82d/cancel");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, undefined);

  // 422 INVALID_SESSION_STATUS: the session is already terminal — idempotent no-op.
  const terminal = makeProvider([{ ok: false, status: 422, json: { error_code: "INVALID_SESSION_STATUS" } }]);
  const noop = await terminal.provider.cancelPaymentSession("ps-661f87c614802d6c402cd82d");
  assert.equal(noop.ok, true);
  assert.equal(noop.value.accepted, false);
});
