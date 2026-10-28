import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import postgres from 'postgres';
import * as persistence from '../dist/index.js';
import {createFirstPartyCheckout,applyIpaymuCallback,FixedClock,CryptoIdGenerator} from '@yubie/application';

test('inventory onboarding is a protected explicit operation',()=>{
  assert.equal(typeof persistence.PostgresInventoryOnboarding,'function');
});
test('PostgreSQL onboarding replay, stale counts, QC gating, bundle contention and ledger immutability',{skip:!process.env.DATABASE_URL},async()=>{
 const admin=postgres(process.env.DATABASE_URL,{max:1});const name=`inventory_release_${Date.now()}`;
 await admin`CREATE DATABASE ${admin(name)}`;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
 const db=persistence.createDatabase(url.toString());
 try {
  for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort()) await db.client.unsafe(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
  const service=new persistence.PostgresInventoryOnboarding(db);
  const input={operationId:'count-shake-1',actor:'synthetic-operator',reason:'verified initial count',countedAt:new Date().toISOString(),policies:[
   {productId:'shake',sizeId:'sachet',version:1,approvalRef:'synthetic-packaging',components:[{productId:'shake',sizeId:'sachet',quantity:1}]},
   {productId:'shake',sizeId:'pack-7',version:1,approvalRef:'synthetic-packaging',components:[{productId:'shake',sizeId:'sachet',quantity:7}]}
  ],lots:[{productId:'shake',sizeId:'sachet',lotCode:'SYNTHETIC-LOT',unitOfMeasure:'sachet',expiryDate:'2099-01-01',countedUncommittedQuantity:20,expectedAvailable:0,status:'released',qcApprovalRef:'synthetic-qc'}]};
  const dry=await service.run(input,false);assert.equal(dry.applied,false);
  assert.equal(Number((await db.client`SELECT count(*) AS n FROM inventory_lots`)[0].n),0);
  const first=await service.run(input,true);assert.equal(first.applied,true);
  assert.deepEqual(await service.run(input,true),first);
  assert.equal((await db.client`SELECT quantity_on_hand FROM inventory_lots`)[0].quantity_on_hand,20);
  await assert.rejects(()=>service.run({...input,operationId:'bad-packaging-dry-run',policies:input.policies.map(p=>({...p,approvalRef:'different-approval-without-version'})),lots:input.lots.map(l=>({...l,expectedAvailable:20}))},false),/version/i);
  await assert.rejects(()=>service.run({...input,reason:'changed'},true),/identity/);
  await assert.rejects(()=>service.run({...input,operationId:'stale-count'},true),/stale/);
  const repo=new persistence.PostgresInventoryRepository(db);
  assert.equal((await repo.availability(new Date().toISOString())).find(x=>x.productId==='shake'&&x.sizeId==='pack-7').maxQuantity,2);
  let creates=0;const provider={createPaymentSession:async()=>({ok:true,value:{provider:'ipaymu',providerSessionId:'synthetic-'+(++creates),redirectUrl:'https://sandbox.ipaymu.com/payment/synthetic',rawStatus:'PENDING',expiresAt:null}})};
  const deps={tx:new persistence.PostgresTransactionManager(db),provider,clock:new FixedClock(new Date().toISOString()),ids:new CryptoIdGenerator()};
  const checkout=(sizeId,quantity,n)=>createFirstPartyCheckout({lines:[{productId:'shake',sizeId,quantity}],provider:'ipaymu',inventoryMode:'lots',customerEmail:'synthetic@example.invalid',successReturnUrl:'https://sandbox.example.invalid/return',cancelReturnUrl:'https://sandbox.example.invalid/cancel',idempotencyPrincipal:'guest:'+String(n).repeat(64),idempotencyKey:'synthetic-'+n},deps);
  const race=await Promise.all([checkout('pack-7',2,1),checkout('sachet',7,2)]);
  assert.equal(race.filter(x=>x.ok).length,1);assert.equal(creates,1);assert.ok((await db.client`SELECT quantity_on_hand FROM inventory_lots`)[0].quantity_on_hand>=0);
  const winner=race.find(x=>x.ok).value;
  await db.client`UPDATE inventory_lots SET status='recalled'`;
  const [payment]=await db.client`SELECT p.*,o.checkout_ref FROM order_payments p JOIN orders o ON p.order_id=o.id WHERE o.checkout_ref=${winner.checkoutRef}`;
  const event={referenceId:winner.checkoutRef,merchant:'synthetic-merchant',expectedMerchant:'synthetic-merchant',amount:winner.totalAmount,currency:'IDR',authoritativeStatus:'succeeded',authoritativeReferenceId:winner.checkoutRef,authoritativeAmount:winner.totalAmount,trxId:'123',sessionId:payment.provider_session_id,dedupeKey:'synthetic-paid'};
  assert.equal((await applyIpaymuCallback(event,deps)).result,'applied');
  assert.equal((await applyIpaymuCallback(event,deps)).result,'duplicate');
  const [paid]=await db.client`SELECT status,fulfillment_hold FROM orders WHERE checkout_ref=${winner.checkoutRef}`;
  assert.equal(paid.status,'paid');assert.equal(paid.fulfillment_hold,'lot_unavailable_after_reservation');
  await db.client`UPDATE orders SET fulfillment_hold=NULL WHERE checkout_ref=${winner.checkoutRef}`;
  const availableNow=(await db.client`SELECT quantity_on_hand FROM inventory_lots`)[0].quantity_on_hand;
  const recalled={...input,operationId:"recall-after-payment",lots:[{...input.lots[0],status:"recalled",expectedAvailable:availableNow,countedUncommittedQuantity:availableNow}]};
  await service.run(recalled,true);
  assert.equal((await db.client`SELECT fulfillment_hold FROM orders WHERE checkout_ref=${winner.checkoutRef}`)[0].fulfillment_hold,"lot_recalled");
  await assert.rejects(()=>service.run({...recalled,operationId:"unsafe-recount-release",lots:[{...recalled.lots[0],status:"released"}]},true),/recalled/i);
  const paymentsRepo=new persistence.PostgresPaymentRepository(db);
  const paymentRecord=(await paymentsRepo.findById(payment.id)).value;
  await paymentsRepo.save({...paymentRecord,reconciliationState:"provider_mismatch"});
  for(const state of ["pending_reconciliation",null,"attach_failed","ambiguous_create","provider_create_failed"]){
    await paymentsRepo.save({...paymentRecord,reconciliationState:state});
    assert.equal((await paymentsRepo.findById(payment.id)).value.reconciliationState,"provider_mismatch");
    assert.equal(await paymentsRepo.hasFinancialException(),true);
  }
  assert.equal((await repo.availability(new Date().toISOString())).find(x=>x.productId==='shake'&&x.sizeId==='sachet').maxQuantity,0);
  await assert.rejects(()=>db.client`UPDATE inventory_movements SET quantity_delta=0`,/append-only/);
  await assert.rejects(()=>service.run({...input,operationId:'missing-qc',lots:[{...input.lots[0],qcApprovalRef:''}]},true),/QC/);
 } finally {await persistence.closeDatabase(db);await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;await admin.end();}
});
