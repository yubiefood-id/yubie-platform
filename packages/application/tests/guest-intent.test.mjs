import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutIntentHash,
  checkoutPrincipalKey,
  createFirstPartyCheckout,
  FixedClock,
  InMemoryAuditRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryOrderRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemoryTransactionManager,
  InMemoryWebhookInboxRepository,
  SequentialIdGenerator,
} from "../dist/index.js";

const GUEST_A = "A".repeat(43);
const GUEST_B = "B".repeat(43);

function makeDeps() {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const tx = new InMemoryTransactionManager({
    orders,
    payments,
    paymentEvents: new InMemoryPaymentEventRepository(),
    audit: new InMemoryAuditRepository(),
    outbox: new InMemoryOutboxRepository(),
    idempotency: new InMemoryIdempotencyRepository(),
    inbox: new InMemoryWebhookInboxRepository(),
    inventory: new InMemoryInventoryRepository(),
  });
  const provider = {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      return { ok: true, value: { provider: "ipaymu", providerSessionId: `sess-${input.referenceId}`, redirectUrl: `https://sandbox.example/pay/${input.referenceId}`, rawStatus: "ACTIVE", expiresAt: null } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: false } }; },
  };
  return { orders, payments, provider, tx, clock: new FixedClock("2026-10-20T00:00:00.000Z"), ids: new SequentialIdGenerator() };
}

const CART = {
  lines: [{ productId: "flour", sizeId: "250g", quantity: 2 }, { productId: "mie", sizeId: "single", quantity: 1 }],
  customerEmail: "guest@example.com",
  successReturnUrl: "https://staging.example/checkout/success",
  cancelReturnUrl: "https://staging.example/checkout/cancel",
  provider: "ipaymu",
};

test("principal key is user:<id> or guest:<sha256 hex> and never contains the raw cookie", () => {
  assert.equal(checkoutPrincipalKey({ userId: "u_1", guestToken: GUEST_A }), "user:u_1");
  const guest = checkoutPrincipalKey({ userId: null, guestToken: GUEST_A });
  assert.match(guest, /^guest:[0-9a-f]{64}$/);
  assert.equal(guest.includes(GUEST_A), false);
  assert.notEqual(guest, checkoutPrincipalKey({ guestToken: GUEST_B }));
  assert.equal(checkoutPrincipalKey({ guestToken: "short" }), null);
  assert.equal(checkoutPrincipalKey({}), null);
});

test("intent hash ignores line order, JSON key order, duplicate-line splitting, and promo case", () => {
  const base = checkoutIntentHash({ lines: CART.lines, promoCode: "YUBIE15", delivery: { city: "Bogor", phone: "0812345678", address: "Jl. Test 1" } });
  assert.equal(base, checkoutIntentHash({
    lines: [{ quantity: 1, sizeId: "single", productId: "mie" }, { productId: "flour", sizeId: "250g", quantity: 1 }, { productId: "flour", sizeId: "250g", quantity: 1 }],
    promoCode: " yubie15 ",
    delivery: { address: "Jl. Test 1 ", phone: "0812345678", city: "Bogor" },
  }));
  assert.notEqual(base, checkoutIntentHash({ lines: [{ productId: "flour", sizeId: "250g", quantity: 3 }, { productId: "mie", sizeId: "single", quantity: 1 }], promoCode: "YUBIE15", delivery: { city: "Bogor", phone: "0812345678", address: "Jl. Test 1" } }));
  assert.notEqual(base, checkoutIntentHash({ lines: CART.lines, delivery: { city: "Bogor", phone: "0812345678", address: "Jl. Test 1" } }));
});

test("the literal global guest principal is refused", async () => {
  const deps = makeDeps();
  const result = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: "guest" }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "validation");
  assert.equal(deps.provider.created.length, 0);
});

test("the same guest resubmitting the same cart gets the same intent and one provider session", async () => {
  const deps = makeDeps();
  const principal = checkoutPrincipalKey({ guestToken: GUEST_A });
  const first = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: principal, idempotencyKey: "k-1" }, deps);
  const second = await createFirstPartyCheckout({ ...CART, lines: [...CART.lines].reverse(), idempotencyPrincipal: principal, idempotencyKey: "k-2" }, deps);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.value.checkoutToken, first.value.checkoutToken);
  assert.equal(deps.provider.created.length, 1);
  const payment = [...deps.payments.items.values()][0];
  assert.equal(payment.principalKey, principal);
});

test("two guests with the same cart get separate intents", async () => {
  const deps = makeDeps();
  const a = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: checkoutPrincipalKey({ guestToken: GUEST_A }), idempotencyKey: "same" }, deps);
  const b = await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: checkoutPrincipalKey({ guestToken: GUEST_B }), idempotencyKey: "same" }, deps);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.value.checkoutToken, b.value.checkoutToken);
  assert.equal(deps.provider.created.length, 2);
});

test("a guest intent and a later authenticated intent stay separate", async () => {
  const deps = makeDeps();
  const guest = await createFirstPartyCheckout({
    ...CART,
    idempotencyPrincipal: checkoutPrincipalKey({ guestToken: GUEST_A }),
    idempotencyKey: "guest-before-login",
  }, deps);
  const authenticated = await createFirstPartyCheckout({
    ...CART,
    idempotencyPrincipal: "user:u_1",
    idempotencyKey: "user-after-login",
  }, deps);
  assert.equal(guest.ok, true);
  assert.equal(authenticated.ok, true);
  assert.notEqual(authenticated.value.checkoutToken, guest.value.checkoutToken);
  assert.equal(deps.provider.created.length, 2);
  assert.deepEqual(
    new Set([...deps.payments.items.values()].map((payment) => payment.principalKey)),
    new Set([checkoutPrincipalKey({ guestToken: GUEST_A }), "user:u_1"]),
  );
});

test("reusing an idempotency key with a different email is a conflict, not a replay", async () => {
  const deps = makeDeps();
  const principal = checkoutPrincipalKey({ guestToken: GUEST_A });
  await createFirstPartyCheckout({ ...CART, idempotencyPrincipal: principal, idempotencyKey: "k-email" }, deps);
  const other = await createFirstPartyCheckout({ ...CART, customerEmail: "other@example.com", idempotencyPrincipal: principal, idempotencyKey: "k-email" }, deps);
  assert.equal(other.ok, false);
  assert.equal(other.error.code, "conflict");
});

test("V3 hashing includes phone and all delivery fields but excludes expiring pin receipts", async () => {
  const { checkoutIntentHashV3, checkoutRequestHashV3 } = await import('../dist/index.js');
  assert.equal(typeof checkoutIntentHashV3,'function');
  const input={lines:CART.lines,promoCode:' yubie15 ',delivery:{city:'Bandung',fullAddress:'Alamat sintetis',building:'A',pin:{latitude:-6.9,longitude:107.6,confirmed:true,validationToken:'first-receipt'}}};
  const hash=checkoutIntentHashV3(input);
  assert.equal(hash,checkoutIntentHashV3({...input,delivery:{...input.delivery,pin:{...input.delivery.pin,validationToken:'renewed-receipt'}}}));
  assert.notEqual(hash,checkoutIntentHashV3({...input,delivery:{...input.delivery,building:'B'}}));
  assert.notEqual(hash,checkoutIntentHashV3({...input,delivery:{...input.delivery,pin:{...input.delivery.pin,longitude:107.7}}}));
  assert.notEqual(hash,checkoutIntentHash(input));
  assert.equal(checkoutRequestHashV3(hash,{phone:'+6281234567890'}),checkoutRequestHashV3(hash,{phone:'+6281234567890',email:null}));
  assert.notEqual(checkoutRequestHashV3(hash,{phone:'+6281234567890'}),checkoutRequestHashV3(hash,{phone:'+12025550100'}));
});

test('stored checkout replay survives catalog withdrawal without repricing or a second provider create',async()=>{
 const {productFamilies}=await import('@yubie/domain');
 const deps=makeDeps(),input={...CART,idempotencyPrincipal:checkoutPrincipalKey({guestToken:GUEST_A}),idempotencyKey:'historic-replay'};
 const first=await createFirstPartyCheckout(input,deps);assert.equal(first.ok,true);
 const product=productFamilies.find(product=>product.id==='flour'),previous=product.status;
 try{product.status='coming_soon';const replay=await createFirstPartyCheckout(input,deps);assert.deepEqual(replay,first);assert.equal(deps.provider.created.length,1);}
 finally{product.status=previous;}
});
