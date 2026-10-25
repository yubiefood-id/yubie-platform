import test from "node:test";
import assert from "node:assert/strict";
import * as app from "../dist/index.js";
async function fixture() {
 const repos={orders:new app.InMemoryOrderRepository(),payments:new app.InMemoryPaymentRepository(),paymentEvents:new app.InMemoryPaymentEventRepository(),audit:new app.InMemoryAuditRepository(),outbox:new app.InMemoryOutboxRepository(),idempotency:new app.InMemoryIdempotencyRepository(),inbox:new app.InMemoryWebhookInboxRepository(),inventory:new app.InMemoryInventoryRepository()};
 const tx=new app.InMemoryTransactionManager(repos),clock=new app.FixedClock("2026-10-24T00:00:00Z"),ids=new app.CryptoIdGenerator();
 const provider={createPaymentSession:async()=>({ok:true,value:{provider:"ipaymu",providerSessionId:"session",redirectUrl:"https://sandbox.ipaymu.com/payment/session",rawStatus:"PENDING",expiresAt:null}})};
 const created=await app.createFirstPartyCheckout({lines:[{productId:"flour",sizeId:"250g",quantity:1}],customerEmail:"synthetic@example.invalid",provider:"ipaymu",idempotencyPrincipal:"user:synthetic",idempotencyKey:"notification",successReturnUrl:"https://synthetic.invalid/return",cancelReturnUrl:"https://synthetic.invalid/cancel"},{tx,clock,ids,provider});
 const notification={referenceId:created.value.checkoutRef,amount:35000,currency:"IDR",trxId:"123",sessionId:"session",payloadHash:"a".repeat(64)};
 return {repos,notification,deps:{tx,clock,ids,merchant:"synthetic",provider:{getPaymentSession:async()=>({ok:true,value:{provider:"ipaymu",providerSessionId:"session",rawStatus:"SUCCEEDED",redirectUrl:"",expiresAt:null,referenceId:created.value.checkoutRef,amount:35000}})}}};
}
test("an incomplete provider lookup keeps the pre-acked notification retryable",async()=>{
 const f=await fixture();f.deps.provider.getPaymentSession=async()=>({ok:true,value:{provider:"ipaymu",providerSessionId:"session",rawStatus:"SUCCEEDED",redirectUrl:"",expiresAt:null}});
 const result=await app.processPaymentNotification(f.notification,f.deps);
 assert.equal(result.terminal,false);assert.equal(result.reason,"authoritative_incomplete");
 assert.equal([...f.repos.payments.items.values()][0].status,"pending");
});
test("a rejected lookup remains a durable correlated exception instead of generic processing success",async()=>{
 const f=await fixture();f.deps.provider.getPaymentSession=async()=>({ok:true,value:{provider:"ipaymu",providerSessionId:"session",rawStatus:"SUCCEEDED",redirectUrl:"",expiresAt:null,referenceId:f.notification.referenceId,amount:1}});
 const result=await app.processPaymentNotification(f.notification,f.deps);
 assert.equal(result.outcome,"rejected");assert.equal(result.reason,"authoritative_mismatch");
 assert.equal([...f.repos.payments.items.values()][0].status,"pending");
 assert.equal([...f.repos.payments.items.values()][0].reconciliationState,"provider_mismatch");
 assert.ok(f.repos.outbox.events.some(event=>event.eventType==="payment.exception"));
 const pending=await app.applyIpaymuCallback({...f.notification,merchant:"synthetic",expectedMerchant:"synthetic",authoritativeStatus:"pending",authoritativeReferenceId:f.notification.referenceId,authoritativeAmount:35000,dedupeKey:"delayed-pending"},f.deps);
 assert.equal(pending.result,"pending");
 assert.equal(await f.repos.payments.hasFinancialException(),true);
});
