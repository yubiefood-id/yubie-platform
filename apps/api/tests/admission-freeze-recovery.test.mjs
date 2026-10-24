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

// Financial incident-recovery proof (release mission §6 / ROLLBACK.md R1):
// with YUBIE_CHECKOUT_ADMISSION=disabled under an ipaymu-mode deployment —
//   1. the existing iPaymu session stays identifiable (pending payment row),
//   2. NEW checkout creation is refused,
//   3. an authenticated callback for the EXISTING session still applies,
//   4. payment persistence and stock transitions stay exactly-once,
//   5. redelivery/restart replays are duplicate no-ops,
//   6. a second successful transaction raises a durable payment exception
//      and its outbox entry is still produced under the freeze,
//   7. lifting the freeze reopens checkout (control contrast).
// Never flip COMMERCE_PROVIDER during such an incident: the webhook route is
// provider-gated (see api-ipaymu-webhook suite) — the freeze is the lever.

const NOW = "2026-10-24T00:00:00.000Z";
const VA = "sandbox-va";

const orders = new InMemoryOrderRepository();
const payments = new InMemoryPaymentRepository();
const paymentEvents = new InMemoryPaymentEventRepository();
const inventory = new InMemoryInventoryRepository();
const outbox = new InMemoryOutboxRepository();
const provider = {
  rawStatus: "SUCCEEDED",
  async createPaymentSession() {
    throw new Error("freeze test must not create a session");
  },
  async getPaymentSession(id) {
    return { ok: true, value: { provider: "ipaymu", providerSessionId: "sess-1", redirectUrl: null, rawStatus: this.rawStatus, expiresAt: null, referenceId: "co_freeze", amount: 35000, providerPaymentId: id } };
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
  releaseSha: "admission-freeze-test",
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
  appOrigin: "https://yubiefood.com",
  verifier: null,
  googleClientId: null,
  tx: new InMemoryTransactionManager({
    orders,
    payments,
    paymentEvents,
    audit: new InMemoryAuditRepository(),
    outbox,
    idempotency: new InMemoryIdempotencyRepository(),
    inbox: new InMemoryWebhookInboxRepository(),
    inventory,
  }),
});

async function seedExistingSession() {
  await orders.save({
    id: "ord_freeze",
    checkoutRef: "co_freeze",
    checkoutPublicToken: "c".repeat(32),
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
    id: "pay_freeze",
    orderId: "ord_freeze",
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
    id: "lot_freeze",
    productId: "flour",
    sizeId: "250g",
    lotCode: "FROZEN",
    quantityOnHand: 9,
    expiryDate: "2027-06-30",
    status: "released",
    releasedAt: NOW,
    releaseReason: "fixture",
    createdAt: NOW,
  });
  await inventory.reserveForOrder({
    orderId: "ord_freeze",
    lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
    now: NOW,
    expiresAt: "2026-10-25T00:00:00.000Z",
  });
}

function postCallback(fields) {
  return handleRequest(new Request("https://api.yubiefood.com/v1/webhooks/ipaymu", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": signIpaymuCallback(fields, VA) },
    body: JSON.stringify(fields),
  }));
}

function postCheckout() {
  return handleRequest(new Request("https://api.yubiefood.com/v1/checkouts", {
    method: "POST",
    body: JSON.stringify({ lines: [{ productId: "yubie-flour", sizeId: "250g", quantity: 1 }], customerEmail: "next@example.test" }),
    headers: { "content-type": "application/json" },
  }));
}

test("checkout freeze keeps in-flight iPaymu obligations fully recoverable", async () => {
  const NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN", "YUBIE_CHECKOUT_ADMISSION"];
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    process.env.YUBIE_CHECKOUT_ADMISSION = "disabled";
    await seedExistingSession();

    // (1) existing session stays identifiable and unresolved before the freeze proof.
    assert.equal(payments.items.get("pay_freeze").status, "pending");
    assert.equal(inventory.lots.get("lot_freeze").quantityOnHand, 8, "reservation held (9 on hand minus 1 reserved)");

    // (2) NEW payable sessions are refused while the provider context stays ipaymu.
    const frozen = await postCheckout();
    assert.equal(frozen.status, 503);
    assert.equal((await frozen.json()).code, "CHECKOUT_DISABLED");

    // (3) an authenticated SUCCEEDED callback for the EXISTING session applies.
    const paidFields = { reference_id: "co_freeze", merchant: VA, amount: 35000, sid: "sess-1", trx_id: 700 };
    const paid = await postCallback(paidFields);
    assert.equal(paid.status, 200);
    assert.equal((await paid.json()).data.result, "applied");
    assert.equal(orders.items.get("ord_freeze").status, "paid");
    // (4) exactly-once: the reservation converts to consumption, never double-decrements.
    assert.equal(inventory.lots.get("lot_freeze").quantityOnHand, 8);

    // (5) redelivery (e.g. after an API restart) is a duplicate no-op.
    const replay = await postCallback(paidFields);
    assert.equal((await replay.json()).data.result, "duplicate");
    assert.equal(orders.items.get("ord_freeze").status, "paid");
    assert.equal(inventory.lots.get("lot_freeze").quantityOnHand, 8);

    // (6) a second distinct successful transaction raises a durable exception
    // and the payment-exception outbox keeps producing under the freeze.
    const outboxBefore = outbox.events.length;
    const dupeSuccess = { ...paidFields, trx_id: 701 };
    const flagged = await postCallback(dupeSuccess);
    assert.equal(flagged.status, 200);
    assert.equal(orders.items.get("ord_freeze").status, "paid");
    assert.ok(outbox.events.length > outboxBefore, "payment-exception outbox entry produced during freeze");

    // (7) control contrast: lifting the freeze reopens checkout creation.
    process.env.YUBIE_CHECKOUT_ADMISSION = "enabled";
    const open = await postCheckout();
    const body = await open.json();
    assert.notEqual(body.code, "CHECKOUT_DISABLED");
    assert.notEqual(open.status, 503);
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
