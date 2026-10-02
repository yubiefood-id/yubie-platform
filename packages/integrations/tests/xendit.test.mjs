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
  payment_session_id: "ps_1",
  payment_link_url: "https://xen.to/abc",
  status: "ACTIVE",
  expires_at: "2026-01-02T00:00:00Z",
  business_id: "biz-1",
};

test("create session sends the ADR-012 request contract and maps the response", async () => {
  const { provider, calls } = makeProvider([{ json: SESSION_RESPONSE }]);
  const result = await provider.createPaymentSession(SESSION_INPUT);
  assert.equal(result.ok, true);
  assert.equal(result.value.provider, "xendit");
  assert.equal(result.value.providerSessionId, "ps_1");
  assert.equal(result.value.redirectUrl, "https://xen.to/abc");
  assert.equal(result.value.rawStatus, "ACTIVE");

  const call = calls[0];
  assert.equal(call.input, "https://xendit.test/payment_sessions");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.authorization, `Basic ${Buffer.from("test-secret:").toString("base64")}`);
  const body = JSON.parse(call.init.body);
  assert.equal(body.reference_id, "co_1");
  assert.equal(body.session_type, "PAY");
  assert.equal(body.country, "ID");
  assert.equal(body.currency, "IDR");
  assert.equal(body.capture_method, "AUTOMATIC");
  assert.equal(body.locale, "id");
  assert.equal(body.success_return_url, "https://yubie.id/checkout/success");
  assert.equal(body.cancel_return_url, "https://yubie.id/checkout/cancel");
  assert.deepEqual(body.items[0], { reference_id: "flour-250g", name: "Yubie Flour 250 g", type: "PHYSICAL_PRODUCT", quantity: 2, net_unit_amount: 15000, currency: "IDR" });
});

test("provider failures surface as unavailable errors, never fake sessions", async () => {
  const { provider } = makeProvider([{ ok: false, status: 400, json: { error_code: "VALIDATION_ERROR" } }]);
  const result = await provider.createPaymentSession(SESSION_INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");

  const missing = makeProvider([{ json: {} }]);
  const bad = await missing.provider.createPaymentSession(SESSION_INPUT);
  assert.equal(bad.ok, false);
});

test("get session maps status and returns null on 404", async () => {
  const ok = makeProvider([{ json: { ...SESSION_RESPONSE, status: "SUCCEEDED" } }]);
  const found = await ok.provider.getPaymentSession("ps_1");
  assert.equal(found.ok, true);
  assert.equal(found.value.rawStatus, "SUCCEEDED");

  const missing = makeProvider([{ ok: false, status: 404, json: {} }]);
  const notFound = await missing.provider.getPaymentSession("ps_none");
  assert.equal(notFound.ok, true);
  assert.equal(notFound.value, null);
});
