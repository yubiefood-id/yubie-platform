import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CHECKOUT_TOTAL_IDR,
  buildOrderTotals,
  quoteApprovedCampaign,
} from "@yubie/domain";
import {
  buildProviderLineItems,
  createFirstPartyCheckout,
  getCheckoutStatus,
  currentCheckout,
  applyIpaymuCallback,
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

/** Mirrors the iPaymu adapter's line-sum check so a mismatch fails the same way. */
function makeSumCheckingProvider(kind) {
  return {
    created: [],
    async createPaymentSession(input) {
      this.created.push(input);
      const lineTotal = input.items.reduce((sum, item) => sum + item.netUnitAmount * item.quantity, 0);
      if (lineTotal !== input.amount) {
        return { ok: false, error: { code: "validation", message: "line totals must equal amount", retryable: false, requestId: "stub" } };
      }
      return { ok: true, value: { provider: kind, providerSessionId: `sess-${this.created.length}`, redirectUrl: "https://sandbox.example/pay", rawStatus: "ACTIVE", expiresAt: null } };
    },
    async getPaymentSession() { return { ok: true, value: null }; },
    async cancelPaymentSession() { return { ok: true, value: { accepted: false } }; },
  };
}

function makeDeps(kind = "ipaymu") {
  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  const inbox = new InMemoryWebhookInboxRepository();
  const inventory = new InMemoryInventoryRepository();
  const tx = new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox, inventory });
  return {
    orders,
    payments,
    provider: makeSumCheckingProvider(kind),
    clock: new FixedClock("2026-10-20T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    tx,
  };
}

const BASE = {
  customerEmail: "buyer@example.com",
  successReturnUrl: "https://staging.example/checkout/success",
  cancelReturnUrl: "https://staging.example/checkout/cancel",
  idempotencyPrincipal: "user:test",
  rawRequestBody: "{}",
  provider: "ipaymu",
};

const promoCases = [
  { name: "YUBIE15, one product", lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }], subtotal: 35000 },
  { name: "YUBIE15, several products", lines: [{ productId: "flour", sizeId: "1kg", quantity: 2 }, { productId: "shake", sizeId: "sachet", quantity: 3 }, { productId: "ppang", sizeId: "mini", quantity: 1 }], subtotal: 240000 + 58500 + 9000 },
];

for (const scenario of promoCases) {
  test(`unverified iPaymu promotion is rejected before charging: ${scenario.name}`, async () => {
    const deps = makeDeps();
    const result = await createFirstPartyCheckout({ ...BASE, lines: scenario.lines, promoCode: "YUBIE15" }, deps);
    assert.equal(result.ok, false);
    assert.equal(deps.provider.created.length, 0, 'unverified code never reaches a payment provider');
    assert.equal(deps.orders.items.size, 0);
  });
}

test("iPaymu line builder includes shipping and discount in the single aggregate line", () => {
  const totals = buildOrderTotals(35000, 12000, 0, 5250);
  const priced = [{ id: "flour-250g", productId: "flour", productName: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 1, unitPrice: 35000 }];
  const items = buildProviderLineItems("ipaymu", "co_ref", priced, totals);
  assert.deepEqual(items, [{ referenceId: "co_ref", name: "Pesanan Yubie co_ref", quantity: 1, netUnitAmount: 41750 }]);
});

test("production checkout refuses unapproved shipping before creating an order or provider session", async () => {
  const deps = makeDeps();
  const result = await createFirstPartyCheckout({ ...BASE, requireApprovedShipping: true, lines: [{productId:"flour",sizeId:"250g",quantity:1}] }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "shipping_unavailable");
  assert.equal(deps.orders.items.size, 0);
  assert.equal(deps.provider.created.length, 0);
});

test("a provider poll with another amount cannot confirm a customer's order",async()=>{
 const deps=makeDeps();
 const created=await createFirstPartyCheckout({...BASE,lines:[{productId:"flour",sizeId:"250g",quantity:1}]},deps);
 assert.equal(created.ok,true);
 deps.provider.getPaymentSession=async()=>({ok:true,value:{provider:"ipaymu",providerSessionId:"sess-1",redirectUrl:"",rawStatus:"SUCCEEDED",expiresAt:null,referenceId:created.value.checkoutRef,amount:1}});
 const result=await getCheckoutStatus(created.value.checkoutToken,deps,{poll:true});
 assert.equal(result.value.orderStatus,"pending_payment");assert.equal(result.value.paymentStatus,"pending");
  assert.equal(result.value.reconciliationException,true);
  const next=await createFirstPartyCheckout({...BASE,idempotencyPrincipal:"user:another",lines:[{productId:"flour",sizeId:"250g",quantity:1}]},deps);
  assert.equal(next.ok,false);assert.equal(next.error.code,"checkout_safety_hold");
});

test("a poll proof cannot settle a different transaction recorded while the request was in flight",async()=>{
 const deps=makeDeps();const created=await createFirstPartyCheckout({...BASE,lines:[{productId:"flour",sizeId:"250g",quantity:1}]},deps);
 const payment=[...deps.payments.items.values()][0];await deps.payments.save({...payment,providerPaymentId:"100"});
 deps.provider.getPaymentSession=async()=>{await deps.payments.save({...payment,providerPaymentId:"200"});return{ok:true,value:{provider:"ipaymu",providerSessionId:"sess-1",providerPaymentId:"100",redirectUrl:"",rawStatus:"SUCCEEDED",expiresAt:null,referenceId:created.value.checkoutRef,amount:35000}};};
 const result=await getCheckoutStatus(created.value.checkoutToken,deps,{poll:true});
 assert.equal(result.value.orderStatus,"pending_payment");assert.equal(result.value.paymentStatus,"pending");
 assert.equal([...deps.payments.items.values()][0].providerPaymentId,"200");
  assert.equal(result.value.reconciliationException,true);
});

test("lost create responses remain recoverable after the callback has already settled the order",async()=>{
 const deps=makeDeps();deps.provider.createPaymentSession=async()=>({ok:false,error:{code:"timeout",message:"unknown",retryable:true,requestId:"synthetic"}});
 const created=await createFirstPartyCheckout({...BASE,idempotencyKey:"lost-response",lines:[{productId:"flour",sizeId:"250g",quantity:1}]},deps);
 assert.equal(created.ok,false);
 const order=[...deps.orders.items.values()][0];
 await applyIpaymuCallback({referenceId:order.checkoutRef,merchant:"synthetic",expectedMerchant:"synthetic",amount:35000,authoritativeStatus:"succeeded",authoritativeReferenceId:order.checkoutRef,authoritativeAmount:35000,trxId:"123",sessionId:"lost-session",dedupeKey:"paid-before-recovery"},deps);
 const recovered=await currentCheckout({userId:"test",guestPrincipal:null,attemptKey:"lost-response"},deps.tx);
 assert.equal(recovered?.checkoutToken,order.checkoutPublicToken);
 assert.equal(recovered?.state,"resolved");
 assert.equal(await currentCheckout({userId:"different-customer",guestPrincipal:null,attemptKey:"lost-response"},deps.tx),null);
});

test("a financial exception arriving during provider create survives successful session attachment",async()=>{
 const deps=makeDeps();const create=deps.provider.createPaymentSession.bind(deps.provider);
 deps.provider.createPaymentSession=async input=>{
  const payment=[...deps.payments.items.values()][0];
  await deps.payments.save({...payment,reconciliationState:"provider_mismatch"});
  return create(input);
 };
 const result=await createFirstPartyCheckout({...BASE,lines:[{productId:"flour",sizeId:"250g",quantity:1}]},deps);
 assert.equal(result.ok,true);assert.equal(await deps.payments.hasFinancialException(),true);
 assert.equal([...deps.payments.items.values()][0].reconciliationState,"provider_mismatch");
});

test("rounding remainder from the 15% discount is floored and the line still equals the grand total", () => {
  const subtotal = 33333;
  const promotion = quoteApprovedCampaign({id:'synthetic',code:'YUBIE15',status:'active',basisPoints:1500,eligibleProductIds:['flour'],startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-11-01T00:00:00Z',approvedAt:'2026-09-30T00:00:00Z',approvedBy:'synthetic',approvalRef:'synthetic',refundPolicy:'retain_consumed'},[{productId:'flour',unitPrice:subtotal,quantity:1}],'2026-10-23T12:00:00Z');
  assert.equal(promotion.discountAmount, 4999);
  const totals = buildOrderTotals(subtotal, 0, 0, promotion.discountAmount);
  const items = buildProviderLineItems("ipaymu", "co_r", [], totals);
  assert.equal(items[0].netUnitAmount, 28334);
  assert.equal(items[0].netUnitAmount, totals.grandTotalAmount);
});

test("Xendit keeps per-product lines at catalog unit prices", () => {
  const totals = buildOrderTotals(70000, 0, 0, 0);
  const priced = [{ id: "flour-250g", productId: "flour", productName: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 35000 }];
  assert.deepEqual(buildProviderLineItems("xendit", "co_x", priced, totals), [
    { referenceId: "flour-250g", name: "Yubie Flour 250 g", quantity: 2, netUnitAmount: 35000 },
  ]);
});

for (const [label, totals] of [
  ["zero", buildOrderTotals(1000, 0, 0, 1000)],
  ["negative", buildOrderTotals(1000, 0, 0, 2000)],
  ["above the cap", buildOrderTotals(MAX_CHECKOUT_TOTAL_IDR + 1, 0, 0, 0)],
]) {
  test(`provider line builder refuses a ${label} grand total`, () => {
    assert.throws(() => buildProviderLineItems("ipaymu", "co_z", [], totals), /payable/);
  });
}

test("a cart above the checkout cap is refused before any order, intent, or provider call", async () => {
  const deps = makeDeps();
  const lines = Array.from({ length: 5 }, () => ({ productId: "shake", sizeId: "pack-7", quantity: 20 }));
  assert.ok(129000 * 20 * 5 > MAX_CHECKOUT_TOTAL_IDR);
  const result = await createFirstPartyCheckout({ ...BASE, lines }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "validation");
  assert.equal(deps.provider.created.length, 0);
  assert.equal(deps.orders.items.size, 0);
});

test('Xendit discounted basket item sum equals the authoritative grand total',()=>{
 const totals=buildOrderTotals(70000,0,0,10500);
 const lines=[{id:'flour-250g',productId:'flour',productName:'Yubie Flour',sizeId:'250g',sizeLabel:'250 g',quantity:2,unitPrice:35000}];
 const items=buildProviderLineItems('xendit','co_synthetic',lines,totals);
 assert.equal(items.reduce((sum,item)=>sum+item.netUnitAmount*item.quantity,0),59500);
});

test('explicit V3 phone-only checkout preserves null email without synthesizing an identity', async()=>{
 const deps=makeDeps('xendit');
 const result=await createFirstPartyCheckout({...BASE,provider:'xendit',checkoutVersion:3,customerPhone:'+6281234567890',customerEmail:null,lines:[{productId:'flour',sizeId:'250g',quantity:1}]},deps);
 assert.equal(result.ok,true);
 const order=[...deps.orders.items.values()][0];assert.equal(order.customerEmail,null);assert.equal(order.customerPhone,'+6281234567890');
 assert.equal(deps.provider.created[0].customerEmail,null);assert.equal(deps.provider.created[0].customerPhone,'+6281234567890');
});
test('V1 still requires email and V3 contact requires a valid canonical phone', async()=>{
 for(const input of [{customerEmail:null},{checkoutVersion:3,customerEmail:null,customerPhone:'invalid'},{checkoutVersion:3,customerEmail:null}]){
  const deps=makeDeps();const result=await createFirstPartyCheckout({...BASE,...input,lines:[{productId:'flour',sizeId:'250g',quantity:1}]},deps);
  assert.equal(result.ok,false);assert.equal(result.error.code,'validation');assert.equal(deps.provider.created.length,0);
 }
});
