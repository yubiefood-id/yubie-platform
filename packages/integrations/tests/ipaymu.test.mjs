import assert from "node:assert/strict";
import test from "node:test";
import {
  IpaymuPaymentProvider,
  createCommercePaymentProvider,
  signIpaymuCallback,
  signIpaymuRequest,
  verifyIpaymuCallback,
} from "../dist/index.js";

const VA = "sandbox-va";
const API_KEY = "sandbox-key";
const NOW = new Date("2026-10-19T00:00:00.000Z");

function provider(fetchFn) {
  return new IpaymuPaymentProvider({
    va: VA,
    apiKey: API_KEY,
    notifyUrl: "https://api-staging.yubiefood.com/v1/webhooks/ipaymu",
    fetchFn,
    now: () => NOW,
  });
}

const input = {
  referenceId: "co_test",
  amount: 35000,
  currency: "IDR",
  customerEmail: "buyer@example.com",
  description: "Yubie",
  successReturnUrl: "https://staging.yubiefood.com/checkout/success",
  cancelReturnUrl: "https://staging.yubiefood.com/checkout/cancel",
  items: [{ referenceId: "flour-250g", name: "Yubie Flour 250g", quantity: 1, netUnitAmount: 35000 }],
};

test("create signs the exact JSON body and allowlists the sandbox redirect", async () => {
  const calls = [];
  const session = provider(async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { Status: 200, Data: { SessionID: "sess-1", Url: "https://sandbox.ipaymu.com/payment/sess-1" } };
      },
    };
  });
  const result = await session.createPaymentSession(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.provider, "ipaymu");
  assert.equal(calls.length, 1);
  const signature = signIpaymuRequest("POST", VA, calls[0].init.body, API_KEY);
  assert.equal(calls[0].init.headers.signature, signature);
  assert.equal(calls[0].init.headers.va, VA);
  assert.equal(calls[0].url, "https://sandbox.ipaymu.com/api/v2/payment");
});

test("a provider 500 is ambiguous and is not retried", async () => {
  let calls = 0;
  const session = provider(async () => {
    calls += 1;
    return { ok: false, status: 500, async json() { return {}; } };
  });
  const result = await session.createPaymentSession(input);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");
  assert.equal(calls, 1);
});

for (const status of [408, 409, 429, 500, 502, 503, 504]) {
  test(`provider HTTP ${status} never proves that no payable session exists`, async () => {
    let calls = 0;
    const session = provider(async () => {
      calls++;
      return { ok: false, status, async json() { return {}; } };
    });
    const result = await session.createPaymentSession(input);
    assert.equal(result.ok, false);
    assert.equal(result.error.retryable, true);
    assert.notEqual(result.error.code, "validation");
    assert.equal(calls, 1);
  });
}

test("a non-sandbox redirect is not returned as a payable URL", async () => {
  const session = provider(async () => ({
    ok: true,
    status: 200,
    async json() {
      return { Status: 200, Data: { SessionID: "sess-1", Url: "https://evil.example/pay" } };
    },
  }));
  const result = await session.createPaymentSession(input);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");
});

test("cancel is unsupported and session lookup is not sent to the transaction API", async () => {
  let calls = 0;
  const session = provider(async () => {
    calls += 1;
    return { ok: true, status: 200, async json() { return {}; } };
  });
  const cancelled = await session.cancelPaymentSession("sess-1");
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.value.accepted, false);
  const lookup = await session.getPaymentSession("sess-1");
  assert.equal(lookup.ok, false);
  assert.equal(lookup.error.code, "unsupported");
  assert.equal(calls, 0);
});

test("transaction check maps settled success and leaves unsettled non-terminal", async () => {
  const calls = [];
  const session = provider(async (url, init) => {
    calls.push({ url, body: init.body });
    return {
      ok: true,
      status: 200,
      async json() {
        return { Status: 200, Data: { TransactionId: 99, SessionId: "sess-1", Status: 6, ReferenceId: "co_test" } };
      },
    };
  });
  const result = await session.getPaymentSession("99");
  assert.equal(result.ok, true);
  assert.equal(result.value.rawStatus, "UNSETTLED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://sandbox.ipaymu.com/api/v2/transaction");
});

test("constructor and factory refuse production hosts", () => {
  assert.throws(() => new IpaymuPaymentProvider({
    va: VA,
    apiKey: API_KEY,
    apiBaseUrl: "https://my.ipaymu.com",
    notifyUrl: "https://api-staging.yubiefood.com/v1/webhooks/ipaymu",
  }), /non-sandbox/);
  assert.equal(createCommercePaymentProvider({
    COMMERCE_PROVIDER: "ipaymu",
    IPAYMU_ENV: "sandbox",
    IPAYMU_VA: VA,
    IPAYMU_API_KEY: API_KEY,
    IPAYMU_NOTIFY_URL: "https://api-staging.yubiefood.com/v1/webhooks/ipaymu",
    IPAYMU_API_BASE_URL: "https://my.ipaymu.com",
  }), null);
  assert.equal(createCommercePaymentProvider({ COMMERCE_PROVIDER: "preview" }), null);
});

test("callback HMAC uses the VA and rejects a mutated amount", () => {
  const fields = {
    reference_id: "co_test",
    merchant: VA,
    amount: "35000",
    status_code: "1",
    trx_id: "99",
    sid: "sess-1",
    status: "berhasil",
  };
  const signature = signIpaymuCallback(fields, VA);
  assert.equal(verifyIpaymuCallback(fields, VA, signature), true);
  assert.equal(verifyIpaymuCallback({ ...fields, amount: "1" }, VA, signature), false);
  assert.equal(verifyIpaymuCallback(fields, "other-va", signature), false);
  assert.notEqual(signIpaymuRequest("POST", VA, JSON.stringify(fields), API_KEY), signature);
});
