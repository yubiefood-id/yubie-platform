import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import {
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
  CryptoSessionTokenService,
  AllowlistAttributionPolicy,
} from "@yubie/application";
import { DefaultRedirectAllowlistPolicy, signIpaymuCallback } from "@yubie/integrations";

const NOW = "2026-10-19T00:00:00.000Z";
const VA = "sandbox-va";

const orders = new InMemoryOrderRepository();
const payments = new InMemoryPaymentRepository();
const paymentEvents = new InMemoryPaymentEventRepository();
const inventory = new InMemoryInventoryRepository();
const provider = {
  gets: 0,
  rawStatus: "SUCCEEDED",
  async createPaymentSession() {
    throw new Error("webhook test must not create a session");
  },
  async getPaymentSession(id) {
    this.gets += 1;
    return { ok: true, value: { provider: "ipaymu", providerSessionId: id, redirectUrl: null, rawStatus: this.rawStatus, expiresAt: null } };
  },
  async cancelPaymentSession() {
    return { ok: true, value: { accepted: false } };
  },
};

setAppContext({
  listings: new InMemoryMarketplaceListingRepository([]),
  whatsapp: new InMemoryWhatsAppIntentRepository(),
  outbound: new InMemoryOutboundIntentRepository(),
  allowlist: new DefaultRedirectAllowlistPolicy(),
  attribution: new AllowlistAttributionPolicy(),
  clock: new FixedClock(NOW),
  ids: new SequentialIdGenerator(),
  healthProbe: { async check() { return { ok: true, value: { ready: true } }; } },
  releaseSha: "ipaymu-webhook-test",
  orders,
  payments,
  paymentEvents,
  users: new InMemoryUserRepository(),
  authSessions: new InMemorySessionRepository(),
  tokens: new CryptoSessionTokenService(),
  paymentMode: "ipaymu",
  paymentProvider: provider,
  ipaymuVa: VA,
  webhookToken: null,
  xenditBusinessId: null,
  inventoryMode: "lots",
  appOrigin: "https://staging.yubiefood.com",
  verifier: null,
  googleClientId: null,
  tx: new InMemoryTransactionManager({
    orders,
    payments,
    paymentEvents,
    audit: new InMemoryAuditRepository(),
    outbox: new InMemoryOutboxRepository(),
    idempotency: new InMemoryIdempotencyRepository(),
    inbox: new InMemoryWebhookInboxRepository(),
    inventory,
  }),
});

async function seed() {
  await orders.save({
    id: "ord_ipaymu",
    checkoutRef: "co_ipaymu",
    checkoutPublicToken: "b".repeat(32),
    status: "pending_payment",
    userId: null,
    customerEmail: "buyer@example.com",
    customerName: null,
    delivery: null,
    currency: "IDR",
    totals: { subtotalAmount: 35000, shippingAmount: 0, discountAmount: 0, taxAmount: 0, grandTotalAmount: 35000 },
    totalAmount: 35000,
    shipping: { policy: "free_promotional", amount: 0 },
    lines: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  await payments.save({
    id: "pay_ipaymu",
    orderId: "ord_ipaymu",
    provider: "ipaymu",
    providerSessionId: "sess-1",
    redirectUrl: "https://sandbox.ipaymu.com/payment/sess-1",
    currency: "IDR",
    amount: 35000,
    status: "pending",
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  inventory.seedLot({
    id: "lot_ipaymu",
    productId: "flour",
    sizeId: "250g",
    lotCode: "API",
    quantityOnHand: 9,
    expiryDate: "2027-06-30",
    status: "released",
    releasedAt: NOW,
    releaseReason: "fixture",
    createdAt: NOW,
  });
  await inventory.reserveForOrder({
    orderId: "ord_ipaymu",
    lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
    now: NOW,
    expiresAt: "2026-10-20T00:00:00.000Z",
  });
}

function post(fields, signature) {
  return handleRequest(new Request("https://api.yubiefood.id/v1/webhooks/ipaymu", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": signature },
    body: JSON.stringify(fields),
  }));
}

test("forged, mismatched, unchecked, and replayed iPaymu callbacks keep the stock invariant", async () => {
  await seed();
  const forged = await post({ reference_id: "co_ipaymu", merchant: VA, amount: 35000 }, "ab".repeat(32));
  assert.equal(forged.status, 401);
  assert.equal(provider.gets, 0);
  assert.equal(orders.items.get("ord_ipaymu").status, "pending_payment");
  assert.equal(inventory.lots.get("lot_ipaymu").quantityOnHand, 8);

  const mismatchFields = { reference_id: "co_ipaymu", merchant: VA, amount: 1 };
  const mismatch = await post(mismatchFields, signIpaymuCallback(mismatchFields, VA));
  assert.equal(mismatch.status, 409);
  assert.equal(orders.items.get("ord_ipaymu").status, "pending_payment");

  const unchecked = { reference_id: "co_ipaymu", merchant: VA, amount: 35000, sid: "sess-1" };
  const pending = await post(unchecked, signIpaymuCallback(unchecked, VA));
  assert.equal(pending.status, 200);
  assert.equal((await pending.json()).data.result, "pending");
  assert.equal(provider.gets, 0);
  assert.equal(orders.items.get("ord_ipaymu").status, "pending_payment");

  const replay = await post(unchecked, signIpaymuCallback(unchecked, VA));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.result, "duplicate");

  provider.rawStatus = "UNSETTLED";
  const unsettled = { ...unchecked, trx_id: 99 };
  const held = await post(unsettled, signIpaymuCallback(unsettled, VA));
  assert.equal(held.status, 200);
  assert.equal((await held.json()).data.result, "pending");
  assert.equal(orders.items.get("ord_ipaymu").status, "pending_payment");
  assert.equal(inventory.lots.get("lot_ipaymu").quantityOnHand, 8);

  provider.rawStatus = "SUCCEEDED";
  const paidFields = { ...unchecked, trx_id: 100 };
  const paid = await post(paidFields, signIpaymuCallback(paidFields, VA));
  assert.equal(paid.status, 200);
  assert.equal((await paid.json()).data.result, "applied");
  assert.equal(orders.items.get("ord_ipaymu").status, "paid");
  const again = await post(paidFields, signIpaymuCallback(paidFields, VA));
  assert.equal((await again.json()).data.result, "duplicate");
  assert.equal(inventory.lots.get("lot_ipaymu").quantityOnHand, 8);
});
