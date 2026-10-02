import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import {
  AllowlistAttributionPolicy,
  CryptoSessionTokenService,
  FixedClock,
  InMemoryAuditRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryMarketplaceListingRepository,
  InMemoryOrderRepository,
  InMemoryOutboundIntentRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemorySessionRepository,
  InMemoryTransactionManager,
  InMemoryUserRepository,
  InMemoryWebhookInboxRepository,
  InMemoryWhatsAppIntentRepository,
  SequentialIdGenerator,
} from "@yubie/application";
import { DefaultRedirectAllowlistPolicy } from "@yubie/integrations";

const stubProvider = {
  created: 0,
  sessionStatus: "ACTIVE",
  async createPaymentSession(input) {
    this.created += 1;
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

const stubOrders = new InMemoryOrderRepository();
const stubPayments = new InMemoryPaymentRepository();
const stubPaymentEvents = new InMemoryPaymentEventRepository();
const stubInventory = new InMemoryInventoryRepository();
stubInventory.seedLot({ id: "lot_api_250", productId: "flour", sizeId: "250g", lotCode: "API-250", quantityOnHand: 1000, expiryDate: "2027-06-30", status: "released", releasedAt: "2026-01-01T00:00:00.000Z", releaseReason: "fixture", createdAt: "2026-01-01T00:00:00.000Z" });

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
  orders: stubOrders,
  payments: stubPayments,
  paymentEvents: stubPaymentEvents,
  users: new InMemoryUserRepository(),
  authSessions: new InMemorySessionRepository(),
  tokens: new CryptoSessionTokenService(),
  paymentMode: "xendit",
  paymentProvider: stubProvider,
  webhookToken: "webhook-secret",
  xenditBusinessId: "biz-1",
  inventoryMode: "lots",
  appOrigin: "https://yubie.id",
  verifier: stubVerifier,
  googleClientId: "test-client-id.apps.googleusercontent.com",
  tx: new InMemoryTransactionManager({
    orders: stubOrders,
    payments: stubPayments,
    paymentEvents: stubPaymentEvents,
    audit: new InMemoryAuditRepository(),
    outbox: new InMemoryOutboxRepository(),
    idempotency: new InMemoryIdempotencyRepository(),
    inbox: new InMemoryWebhookInboxRepository(),
    inventory: stubInventory,
  }),
};

setAppContext(context);

const post = (path, body, headers = {}) => handleRequest(new Request(`https://api.yubiefood.id${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const get = (path, headers = {}) => handleRequest(new Request(`https://api.yubiefood.id${path}`, { headers }));

let idempotencyCounter = 0;

async function createCheckout(extraHeaders = {}) {
  idempotencyCounter += 1;
  const response = await post("/v1/checkouts", {
    lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }],
    customerEmail: "guest@example.com",
    delivery: { phone: "+62812345678", address: "Jl. Test No. 1", city: "Bogor" },
  }, { "idempotency-key": `api-test-${idempotencyCounter}`, ...extraHeaders });
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

function webhookBody(checkout, overrides = {}) {
  // Official payment-session webhook shape (verified 2026-10): business_id is
  // top-level and there is no top-level delivery id.
  return {
    event: "payment_session.completed",
    business_id: "biz-1",
    created: "2026-10-02T00:00:00Z",
    data: {
      payment_session_id: `ps_${checkout.checkoutRef}`,
      reference_id: checkout.checkoutRef,
      status: "COMPLETED",
      currency: "IDR",
      amount: checkout.totalAmount,
      payment_id: "pay_api_1",
      ...overrides,
    },
  };
}

test("live checkout returns an opaque token and the provider redirect", async () => {
  const checkout = await createCheckout();
  assert.equal(checkout.mode, "live");
  assert.equal(checkout.redirectUrl, "https://xen.to/api-test");
  assert.equal(checkout.totalAmount, 30000);
  assert.match(checkout.checkoutToken, /^[0-9a-f]{32}$/);
});

test("idempotent checkout replay returns the first response without a second provider session", async () => {
  idempotencyCounter += 1;
  const key = `api-replay-${idempotencyCounter}`;
  const body = {
    lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
    customerEmail: "replay@example.com",
  };
  const first = await post("/v1/checkouts", body, { "idempotency-key": key });
  const before = stubProvider.created;
  const replay = await post("/v1/checkouts", body, { "idempotency-key": key });
  assert.equal(replay.status, 201);
  assert.deepEqual((await replay.json()).data, (await first.json()).data);
  assert.equal(stubProvider.created, before, "no second Xendit session on replay");

  const conflict = await post("/v1/checkouts", { ...body, customerEmail: "other@example.com" }, { "idempotency-key": key });
  assert.equal(conflict.status, 409);
});

test("checkout status is token-scoped, PII-free, and confirmed only server-side", async () => {
  const checkout = await createCheckout();

  const pending = await (await get(`/v1/checkouts/${checkout.checkoutToken}`)).json();
  assert.equal(pending.data.orderStatus, "pending_payment");
  const publicView = JSON.stringify(pending.data);
  assert.ok(!publicView.includes("customer"), "public status view carries no customer data");
  assert.ok(!publicView.includes("delivery"));
  assert.ok(!publicView.includes("@"));

  // Internal order ids never answer the public endpoint (enumeration-proof).
  const internal = [...stubOrders.items.values()].find((order) => order.checkoutPublicToken === checkout.checkoutToken);
  const byInternalId = await get(`/v1/checkouts/${internal.id}`);
  assert.equal(byInternalId.status, 404);

  const badToken = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout), { "x-callback-token": "wrong" });
  assert.equal(badToken.status, 401);

  const applied = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout), { "x-callback-token": "webhook-secret" });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).data.result, "applied");

  const replay = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout), { "x-callback-token": "webhook-secret" });
  assert.equal((await replay.json()).data.result, "duplicate");

  const mismatch = await post("/v1/webhooks/xendit/payment-session", webhookBody(checkout, { amount: 1 }), { "x-callback-token": "webhook-secret" });
  assert.equal(mismatch.status, 409);

  const foreignBusiness = await post("/v1/webhooks/xendit/payment-session", { ...webhookBody(checkout), business_id: "biz-attacker" }, { "x-callback-token": "webhook-secret" });
  assert.equal(foreignBusiness.status, 403);

  const confirmed = await (await get(`/v1/checkouts/${checkout.checkoutToken}`)).json();
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
  assert.match(setCookie, /Secure/, "Secure follows the configured https APP_ORIGIN, not the request scheme");
  const token = /yubie_session=([^;]+)/.exec(setCookie)?.[1];

  const session = await (await get("/v1/auth/session", { cookie: `yubie_session=${token}` })).json();
  assert.equal(session.data.authenticated, true);
  assert.equal(session.data.googleClientId, context.googleClientId);

  const unauthenticated = await (await get("/v1/account/orders")).json();
  assert.equal(unauthenticated.ok, false);

  const guestCheckout = await createCheckout();
  const ownedBefore = await (await get("/v1/account/orders", { cookie: `yubie_session=${token}` })).json();
  assert.ok(!ownedBefore.data.some((order) => order.totalAmount === guestCheckout.totalAmount && order.orderStatus === "pending_payment"));

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
  }, { cookie: `yubie_session=${token}`, "idempotency-key": `api-logged-in-${Date.now()}` });
  assert.equal(response.status, 201);
  const checkout = (await response.json()).data;
  assert.equal(checkout.totalAmount, 15000);

  const orders = await (await get("/v1/account/orders", { cookie: `yubie_session=${token}` })).json();
  const mine = orders.data.find((order) => order.orderStatus === "pending_payment" && order.totalAmount === 15000);
  assert.ok(mine, "the logged-in checkout appears in the account list");

  const detail = await (await get(`/v1/account/orders/${mine.checkoutId}`, { cookie: `yubie_session=${token}` })).json();
  assert.equal(detail.data.checkoutId, mine.checkoutId);
  assert.equal(detail.data.customerEmail, "user@example.com");
  assert.equal(detail.data.delivery, null);

  // Guest orders are not visible on another account.
  const guestDetail = await get(`/v1/account/orders/ord_nonexistent`, { cookie: `yubie_session=${token}` });
  assert.equal(guestDetail.status, 404);
});
