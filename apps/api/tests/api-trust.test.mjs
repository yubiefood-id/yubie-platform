import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import {
  AllowlistAttributionPolicy,
  CryptoSessionTokenService,
  FixedClock,
  InMemoryAuditRepository,
  InMemoryGrowthRepository,
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
  mode: "ok",
  sessionStatus: "ACTIVE",
  async createPaymentSession(input) {
    this.created += 1;
    if (this.mode === "reject") return { ok: false, error: { code: "validation", message: "rejected", retryable: false, requestId: "x" } };
    if (this.mode === "timeout") return { ok: false, error: { code: "timeout", message: "socket", retryable: true, requestId: "x" } };
    return { ok: true, value: { provider: "xendit", providerSessionId: `ps_${input.referenceId}`, redirectUrl: "https://xen.to/trust", rawStatus: "ACTIVE", expiresAt: "2026-01-02T00:00:00.000Z" } };
  },
  async getPaymentSession(providerSessionId) {
    return { ok: true, value: { provider: "xendit", providerSessionId, redirectUrl: "https://xen.to/trust", rawStatus: this.sessionStatus, expiresAt: null } };
  },
  async cancelPaymentSession() { return { ok: true, value: { accepted: true } }; },
};

const stubVerifier = {
  async verify() {
    return { ok: true, value: { sub: "trust-sub", email: "trust@yubiefood.id", name: "Trust", picture: null, emailVerified: true } };
  },
};

function buildContext() {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const inventory = new InMemoryInventoryRepository();
  inventory.seedLot({ id: "lot_trust", productId: "flour", sizeId: "250g", lotCode: "TRUST", quantityOnHand: 1000, expiryDate: "2027-06-30", status: "released", releasedAt: "2026-01-01T00:00:00.000Z", releaseReason: "fixture", createdAt: "2026-01-01T00:00:00.000Z" });
  return {
    listings: new InMemoryMarketplaceListingRepository([]),
    whatsapp: new InMemoryWhatsAppIntentRepository(),
    outbound: new InMemoryOutboundIntentRepository(),
    allowlist: new DefaultRedirectAllowlistPolicy(),
    attribution: new AllowlistAttributionPolicy(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    healthProbe: { async check() { return { ok: true, value: { ready: true } }; } },
    releaseSha: "trust-test",
    orders,
    payments,
    paymentEvents,
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
    googleClientId: "trust-client-id.apps.googleusercontent.com",
    tx: new InMemoryTransactionManager({
      orders,
      payments,
      paymentEvents,
      audit: new InMemoryAuditRepository(),
      outbox: new InMemoryOutboxRepository(),
      idempotency: new InMemoryIdempotencyRepository(),
      inbox: new InMemoryWebhookInboxRepository(),
      inventory,
      growth: new InMemoryGrowthRepository(),
    }),
    inventoryRef: inventory,
  };
}

const MANAGED = ["API_PROXY_TOKEN", "YUBIE_ENV", "NODE_ENV", "COMMERCE_PROVIDER"];
const ORIGINAL = Object.fromEntries(MANAGED.map((name) => [name, process.env[name]]));

function withEnv(overrides, run) {
  for (const name of MANAGED) delete process.env[name];
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[name] = value;
  }
  return run().finally(() => {
    for (const [name, value] of Object.entries(ORIGINAL)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

const post = (path, body, headers = {}) => handleRequest(new Request(`https://api.yubiefood.id${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const get = (path, headers = {}) => handleRequest(new Request(`https://api.yubiefood.id${path}`, { headers }));

const checkoutBody = { lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }], customerEmail: "trust@example.com" };

test("web-proxy routes require the proxy token (constant-time) outside local envs", async () => {
  await withEnv({ API_PROXY_TOKEN: "hop-secret", YUBIE_ENV: "staging" }, async () => {
    setAppContext(buildContext());
    const missing = await get("/v1/catalog");
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).code, "PROXY_UNAUTHORIZED");

    const wrong = await get("/v1/catalog", { "x-api-proxy-token": "hop-secretx" });
    assert.equal(wrong.status, 401);

    const good = await get("/v1/catalog", { "x-api-proxy-token": "hop-secret" });
    assert.equal(good.status, 200);
  });
});

test("public routes bypass the proxy gate; the webhook uses provider auth instead", async () => {
  await withEnv({ API_PROXY_TOKEN: "hop-secret", YUBIE_ENV: "staging" }, async () => {
    setAppContext(buildContext());
    for (const path of ["/healthz", "/readyz"]) {
      const response = await get(path);
      assert.equal(response.status, 200, `${path} stays public`);
    }

    // No proxy token header at all — the webhook must still reach its OWN
    // authentication (401 from callback-token verification, not the gate).
    const webhook = await post("/v1/webhooks/xendit/payment-session", { event: "payment_session.completed", data: {} }, { "x-callback-token": "wrong" });
    assert.equal(webhook.status, 401);
    assert.equal((await webhook.json()).code, "invalid_callback_token");
  });
});

test("missing proxy token fails closed in staging; development stays open", async () => {
  await withEnv({ YUBIE_ENV: "staging" }, async () => {
    setAppContext(buildContext());
    const response = await get("/v1/catalog");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "PROXY_NOT_CONFIGURED");
  });
  await withEnv({ YUBIE_ENV: "development" }, async () => {
    setAppContext(buildContext());
    const response = await get("/v1/catalog");
    assert.equal(response.status, 200);
  });
});

test("oversized bodies are rejected 413 before any parsing or persistence", async () => {
  await withEnv({ YUBIE_ENV: "development" }, async () => {
    setAppContext(buildContext());
    const huge = { credential: "x".repeat(300_000), g_csrf_token: "a" };
    const auth = await post("/v1/auth/google", huge);
    assert.equal(auth.status, 413);
    assert.equal((await auth.json()).code, "PAYLOAD_TOO_LARGE");

    const bigCheckout = { ...checkoutBody, customerName: "y".repeat(200_000) };
    const checkout = await post("/v1/checkouts", bigCheckout, { "idempotency-key": "cap-1" });
    assert.equal(checkout.status, 413);

    const provider = handleRequest.constructor; // marker to keep tree-shaking honest
    void provider;
  });
});

test("checkout failures map to honest client codes", async () => {
  await withEnv({ YUBIE_ENV: "development" }, async () => {
    const context = buildContext();
    setAppContext(context);

    // Definitive provider rejection -> 400 INVALID_REQUEST, no fake success.
    stubProvider.mode = "reject";
    const rejected = await post("/v1/checkouts", checkoutBody, { "idempotency-key": "map-1" });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).code, "INVALID_REQUEST");
    assert.equal(stubProvider.created, 1);

    // Ambiguous provider outcome -> retryable 503 PROVIDER_UNAVAILABLE.
    stubProvider.mode = "timeout";
    const timedOut = await post("/v1/checkouts", checkoutBody, { "idempotency-key": "map-2" });
    assert.equal(timedOut.status, 503);
    assert.equal((await timedOut.json()).code, "PROVIDER_UNAVAILABLE");

    // Stock-out -> 409 INSUFFICIENT_INVENTORY (not IDEMPOTENCY_KEY_REUSED).
    stubProvider.mode = "ok";
    for (const lot of context.inventoryRef.lots.values()) lot.quantityOnHand = 0;
    const soldOut = await post("/v1/checkouts", checkoutBody, { "idempotency-key": "map-3" });
    assert.equal(soldOut.status, 409);
    assert.equal((await soldOut.json()).code, "INSUFFICIENT_INVENTORY");
  });
});

test("out-of-order terminal webhook acknowledged as stale, state unchanged", async () => {
  await withEnv({ YUBIE_ENV: "development" }, async () => {
    const context = buildContext();
    setAppContext(context);
    stubProvider.mode = "ok";

    const created = await post("/v1/checkouts", checkoutBody, { "idempotency-key": "stale-1" });
    assert.equal(created.status, 201);
    const checkout = (await created.json()).data;

    const completed = await post("/v1/webhooks/xendit/payment-session", {
      event: "payment_session.completed",
      business_id: "biz-1",
      data: { payment_session_id: `ps_${checkout.checkoutRef}`, reference_id: checkout.checkoutRef, status: "COMPLETED", currency: "IDR", amount: checkout.totalAmount },
    }, { "x-callback-token": "webhook-secret" });
    assert.equal(completed.status, 200);

    const lateExpired = await post("/v1/webhooks/xendit/payment-session", {
      event: "payment_session.expired",
      business_id: "biz-1",
      data: { payment_session_id: `ps_${checkout.checkoutRef}`, reference_id: checkout.checkoutRef, status: "EXPIRED" },
    }, { "x-callback-token": "webhook-secret" });
    assert.equal(lateExpired.status, 202);
    assert.equal((await lateExpired.json()).data.result, "stale");

    const status = await (await get(`/v1/checkouts/${checkout.checkoutToken}`)).json();
    assert.equal(status.data.orderStatus, "paid", "succeeded payment never regresses");
    assert.equal(status.data.paymentStatus, "succeeded");
  });
});
