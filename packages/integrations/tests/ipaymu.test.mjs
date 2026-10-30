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

test("reconciliation uses the numeric payment id without mistaking a redirect SessionID for it",async()=>{
 let body=null;
 const session=provider(async(_url,init)=>{body=JSON.parse(init.body);return{ok:true,status:200,json:async()=>({Data:{Status:1,SessionId:"uuid-session",ReferenceId:"co_test",Amount:35000}})};});
 const result=await session.getPaymentSession("uuid-session",{providerPaymentId:"123456",referenceId:"co_test"});
 assert.equal(result.ok,true);assert.deepEqual(body,{transactionId:"123456"});
 assert.equal(result.value.providerSessionId,"uuid-session");
});

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

// iPaymu decoupled its hosted checkout page from the API host: production
// POST /api/v2/payment on my.ipaymu.com returns Data.Url on
// https://payment.ipaymu.com/#/<SessionID> (observed live 2026-10-30; the
// previous single-host allowlist rejected real paying checkouts as
// "unavailable" and parked them as ambiguous creates).
function productionProvider(fetchFn) {
  return new IpaymuPaymentProvider({
    va: "prod-va",
    apiKey: "prod-key",
    env: "production",
    apiBaseUrl: "https://my.ipaymu.com",
    notifyUrl: "https://api.yubiefood.com/v1/webhooks/ipaymu",
    fetchFn,
    now: () => NOW,
  });
}

test("production create accepts the payment.ipaymu.com checkout page", async () => {
  const session = productionProvider(async () => ({
    ok: true,
    status: 200,
    async json() {
      return { Status: 200, Data: { SessionID: "sess-prod-1", Url: "https://payment.ipaymu.com/#/sess-prod-1" } };
    },
  }));
  const result = await session.createPaymentSession(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.providerSessionId, "sess-prod-1");
  assert.equal(result.value.redirectUrl, "https://payment.ipaymu.com/#/sess-prod-1");
});

test("production create still accepts a my.ipaymu.com redirect URL", async () => {
  const session = productionProvider(async () => ({
    ok: true,
    status: 200,
    async json() {
      return { Status: 200, Data: { SessionID: "sess-prod-2", Url: "https://my.ipaymu.com/payment/sess-prod-2" } };
    },
  }));
  const result = await session.createPaymentSession(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.redirectUrl, "https://my.ipaymu.com/payment/sess-prod-2");
});

test("the checkout host payment.ipaymu.com is never accepted as the API origin", () => {
  assert.throws(() => new IpaymuPaymentProvider({
    va: "prod-va",
    apiKey: "prod-key",
    env: "production",
    apiBaseUrl: "https://payment.ipaymu.com",
    notifyUrl: "https://api.yubiefood.com/v1/webhooks/ipaymu",
    now: () => NOW,
  }));
});

test("a sandbox session URL is not accepted in production", async () => {
  const session = productionProvider(async () => ({
    ok: true,
    status: 200,
    async json() {
      return { Status: 200, Data: { SessionID: "sess-x", Url: "https://sandbox.ipaymu.com/payment/sess-x" } };
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

test("constructor and factory bind the API origin to the explicit environment", () => {
  const NOTIFY = "https://api-staging.yubiefood.com/v1/webhooks/ipaymu";
  const PROD_NOTIFY = "https://api.yubiefood.com/v1/webhooks/ipaymu";
  // Sandbox default still refuses production origins.
  assert.throws(() => new IpaymuPaymentProvider({
    va: VA,
    apiKey: API_KEY,
    apiBaseUrl: "https://my.ipaymu.com",
    notifyUrl: NOTIFY,
  }), /official sandbox origin/);
  // Production env with production origin constructs; every other combination throws.
  const production = new IpaymuPaymentProvider({
    va: "prod-va",
    apiKey: "prod-key",
    env: "production",
    notifyUrl: PROD_NOTIFY,
    fetchFn: async () => ({ ok: true, status: 200, async json() { return {}; } }),
  });
  assert.ok(production);
  assert.throws(() => new IpaymuPaymentProvider({
    va: "prod-va", apiKey: "prod-key", env: "production", apiBaseUrl: "https://sandbox.ipaymu.com", notifyUrl: PROD_NOTIFY,
  }), /official production origin/);
  // Host spoofs, ports, http, embedded credentials, and paths are rejected.
  for (const spoof of [
    "https://my.ipaymu.com.evil.tld",
    "https://my.ipaymu.com:8443",
    "http://my.ipaymu.com",
    "https://va:key@my.ipaymu.com",
    "https://my.ipaymu.com/api",
    "https://live.ipaymu.com",
  ]) {
    assert.throws(() => new IpaymuPaymentProvider({
      va: "prod-va", apiKey: "prod-key", env: "production", apiBaseUrl: spoof, notifyUrl: PROD_NOTIFY,
    }), /official production origin/, spoof);
  }
  // Factory: sandbox stays sandbox-only unless IPAYMU_ENV selects production,
  // and production additionally requires YUBIE_ENV=production.
  assert.equal(createCommercePaymentProvider({
    COMMERCE_PROVIDER: "ipaymu",
    IPAYMU_ENV: "sandbox",
    IPAYMU_VA: VA,
    IPAYMU_API_KEY: API_KEY,
    IPAYMU_NOTIFY_URL: NOTIFY,
    IPAYMU_API_BASE_URL: "https://my.ipaymu.com",
  }), null);
  const productionEnv = {
    COMMERCE_PROVIDER: "ipaymu",
    IPAYMU_ENV: "production",
    YUBIE_ENV: "production",
    IPAYMU_VA: "prod-va",
    IPAYMU_API_KEY: "prod-key",
    IPAYMU_NOTIFY_URL: PROD_NOTIFY,
  };
  assert.ok(createCommercePaymentProvider(productionEnv));
  assert.equal(createCommercePaymentProvider({ ...productionEnv, YUBIE_ENV: "staging" }), null);
  assert.equal(createCommercePaymentProvider({ ...productionEnv, YUBIE_ENV: undefined }), null);
  assert.equal(createCommercePaymentProvider({ ...productionEnv, IPAYMU_API_BASE_URL: "https://sandbox.ipaymu.com" }), null);
  assert.equal(createCommercePaymentProvider({ COMMERCE_PROVIDER: "ipaymu", IPAYMU_VA: VA, IPAYMU_API_KEY: API_KEY, IPAYMU_NOTIFY_URL: NOTIFY }), null);
  assert.equal(createCommercePaymentProvider({ COMMERCE_PROVIDER: "preview" }), null);
});

test("production provider posts to the live origin and refuses cross-env redirects", async () => {
  const calls = [];
  const session = new IpaymuPaymentProvider({
    va: "prod-va",
    apiKey: "prod-key",
    env: "production",
    notifyUrl: "https://api.yubiefood.com/v1/webhooks/ipaymu",
    now: () => NOW,
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { Status: 200, Data: { SessionID: "prod-sess", Url: redirectForCall } };
        },
      };
    },
  });
  let redirectForCall = "https://my.ipaymu.com/payment/prod-sess";
  const good = await session.createPaymentSession(input);
  assert.equal(good.ok, true);
  assert.equal(good.value.redirectUrl, "https://my.ipaymu.com/payment/prod-sess");
  assert.equal(calls[0].url, "https://my.ipaymu.com/api/v2/payment");
  // A sandbox-hosted redirect URL can never be accepted by a production provider.
  redirectForCall = "https://sandbox.ipaymu.com/payment/prod-sess";
  const crossEnv = await session.createPaymentSession(input);
  assert.equal(crossEnv.ok, false);
  assert.equal(crossEnv.error.code, "unavailable");
  assert.equal(calls.length, 2);
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

test('phone-only create omits buyerEmail instead of fabricating a placeholder',async()=>{
 let payload;
 const session=provider(async(_url,init)=>{payload=JSON.parse(init.body);return{ok:true,status:200,async json(){return{Status:200,Data:{SessionID:'phone-only',Url:'https://sandbox.ipaymu.com/payment/phone-only'}};}};});
 const result=await session.createPaymentSession({...input,customerEmail:null,customerPhone:'+6281234567890'});
 assert.equal(result.ok,true);assert.equal(Object.hasOwn(payload,'buyerEmail'),false);assert.equal(payload.buyerPhone,'+6281234567890');
});
