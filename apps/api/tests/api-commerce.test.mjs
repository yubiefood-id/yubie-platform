import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import {
  AllowlistAttributionPolicy,
  CryptoSessionTokenService,
  FixedClock,
  InMemoryMarketplaceListingRepository,
  InMemoryOrderRepository,
  InMemoryOutboundIntentRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InMemoryWhatsAppIntentRepository,
  SequentialIdGenerator,
} from "@yubie/application";
import { DefaultRedirectAllowlistPolicy } from "@yubie/integrations";

const stubProvider = {
  sessionStatus: "ACTIVE",
  async createPaymentSession(input) {
    // Unique provider session per checkout so webhook routing is realistic.
    return { ok: true, value: { provider: "xendit", providerSessionId: `ps_${input.referenceId}`, redirectUrl: "https://xen.to/api-test", rawStatus: "ACTIVE", expiresAt: "2026-01-02T00:00:00.000Z" } };
  },
  async getPaymentSession(providerSessionId) {
    return { ok: true, value: { provider: "xendit", providerSessionId, redirectUrl: "https://xen.to/api-test", rawStatus: this.sessionStatus, expiresAt: null } };
  },
  async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
};

const stubVerifier = {
  async verify() {
    return { ok: true, value: { sub: "google-sub-api", email: "hello@yubiefood.id", name: "Hello", picture: null, emailVerified: true } };
  },
};

const context = {
  listings: new InMemoryMarketplaceListingRepository([]),
  whatsapp: new InMemoryWhatsAppIntentRepository(),
  outbound: new InMemoryOutboundIntentRepository(),
  allowlist: new DefaultRedirectAllowlistPolicy(),
  attribution: new AllowlistAttributionPolicy(),
  clock: new FixedClock("2026-01-01T00:00:00.000Z"),
  ids: new SequentialIdGenerator(),
  healthProbe: { async check() { return { ok: true, value: { ready: true } }; } },
  releaseSha: "commerce-test",
  orders: new InMemoryOrderRepository(),
  payments: new InMemoryPaymentRepository(),
  paymentEvents: new InMemoryPaymentEventRepository(),
  users: new InMemoryUserRepository(),
  authSessions: new InMemorySessionRepository(),
  tokens: new CryptoSessionTokenService(),
  paymentMode: "xendit",
  paymentProvider: stubProvider,
  webhookToken: "webhook-secret",
  verifier: stubVerifier,
  googleClientId: "test-client-id.apps.googleusercontent.com",
};

setAppContext(context);

const post = (path, body, headers = {}) => handleRequest(new Request(`https://api.yubiefood.id${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const get = (path, headers = {}) => handleRequest(new Request(`https://api.yubiefood.id${path}`, { headers }));

async function createCheckout() {
  const response = await post("/v1/checkouts", {
    lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }],
    customerEmail: "guest@example.com",
    delivery: { phone: "+62812345678", address: "Jl. Test No. 1", city: "Bogor" },
  });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

function webhookBody(checkout, overrides = {}) {
  return {
    id: "wh-api-1",
    event: "payment.succeeded",
    data: {
      payment_session_id: `ps_${checkout.checkoutRef}`,
      reference_id: checkout.checkoutRef,
      business_id: "biz",
      currency: "IDR",
      amount: checkout.totalAmount,
      ...overrides,
    },
  };
}

test("live checkout creates an order and returns the provider redirect", async () => {
  const checkout = await createCheckout();
  assert.equal(checkout.mode, "live");
  assert.equal(checkout.redirectUrl, "https://xen.to/api-test");
  assert.equal(checkout.totalAmount, 30000);
});

test("checkout status starts pending and is confirmed only server-side", async () => {
  const checkout = await createCheckout();
  const pending = await (await get(`/v1/checkouts/${checkout.checkoutId}`)).json();
  assert.equal(pending.data.orderStatus, "pending_payment");

  const badToken = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout), { "x-callback-token": "wrong" });
  assert.equal(badToken.status, 401);

  const applied = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout), { "x-callback-token": "webhook-secret" });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).data.result, "applied");

  const replay = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout), { "x-callback-token": "webhook-secret" });
  assert.equal((await replay.json()).data.result, "duplicate");

  const mismatch = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout, { amount: 1 }), { "x-callback-token": "webhook-secret" });
  assert.equal(mismatch.status, 409);

  const confirmed = await (await get(`/v1/checkouts/${checkout.checkoutId}`)).json();
  assert.equal(confirmed.data.orderStatus, "paid");
  assert.equal(confirmed.data.paymentStatus, "succeeded");
});

test("google login sets an HttpOnly session and powers the account panel", async () => {
  const csrfFail = await post("/v1/auth/google", { credential: "valid-google-credential", g_csrf_token: "a" }, { cookie: "g_csrf_token=b" });
  assert.equal(csrfFail.status, 401);

  const login = await post("/v1/auth/google", { credential: "valid-google-credential", g_csrf_token: "csrf-ok" }, { cookie: "g_csrf_token=csrf-ok" });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /yubie_session=/);
  assert.match(setCookie, /HttpOnly/);
  const token = /yubie_session=([^;]+)/.exec(setCookie)?.[1];

  const session = await (await get("/v1/auth/session", { cookie: `yubie_session=${token}` })).json();
  assert.equal(session.data.authenticated, true);
  assert.equal(session.data.googleClientId, context.googleClientId);

  const unauthenticated = await (await get("/v1/account/orders")).json();
  assert.equal(unauthenticated.ok, false);

  const guestCheckout = await createCheckout();
  const owned = await (await get("/v1/account/orders", { cookie: `yubie_session=${token}` })).json();
  assert.equal(owned.ok, true);

  const detail = await get(`/v1/account/orders/${guestCheckout.checkoutId}`, { cookie: `yubie_session=${token}` });
  assert.equal(detail.status, 404); // guest order is not attached to the account

  const logoutResponse = await post("/v1/auth/logout", {}, { cookie: `yubie_session=${token}` });
  assert.equal(logoutResponse.status, 200);
  const afterLogout = await (await get("/v1/auth/session", { cookie: `yubie_session=${token}` })).json();
  assert.equal(afterLogout.data.authenticated, false);
});

test("checkout as a logged-in user attaches the order to the account", async () => {
  const login = await post("/v1/auth/google", { credential: "valid-google-credential", g_csrf_token: "csrf-ok" }, { cookie: "g_csrf_token=csrf-ok" });
  const token = /yubie_session=([^;]+)/.exec(login.headers.get("set-cookie") ?? "")?.[1];

  const response = await post("/v1/checkouts", {
    lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
    customerEmail: "user@example.com",
  }, { cookie: `yubie_session=${token}` });
  assert.equal(response.status, 201);
  const checkout = (await response.json()).data;

  const orders = await (await get("/v1/account/orders", { cookie: `yubie_session=${token}` })).json();
  assert.ok(orders.data.some((order) => order.checkoutId === checkout.checkoutId));

  const detail = await (await get(`/v1/account/orders/${checkout.checkoutId}`, { cookie: `yubie_session=${token}` })).json();
  assert.equal(detail.data.checkoutId, checkout.checkoutId);
  assert.equal(detail.data.delivery, null);
});
