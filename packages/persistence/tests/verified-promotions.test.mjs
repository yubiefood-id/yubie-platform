import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile,readdir} from 'node:fs/promises';import * as p from '../dist/index.js';import * as a from '@yubie/application';
const enabled=!!process.env.DATABASE_URL;let admin,db,name,now,deps,actors;
before(async()=>{
 if(!enabled)return;admin=p.createDatabase(process.env.DATABASE_URL);name='promotions_v3_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=p.createDatabase(url.toString());
 const dir=new URL('../migrations/',import.meta.url);for(const f of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async s=>s.unsafe(await readFile(new URL(f,dir),'utf8')));
 now=Date.parse('2026-10-23T12:00:00Z');deps={tx:new p.PostgresTransactionManager(db),clock:{now:()=>new Date(now).toISOString()},ids:{nextId:()=>randomUUID()},tokens:new a.CryptoSessionTokenService()};actors=[];
 for(let i=0;i<6;i++){
  const id='promo_user_'+i,time=deps.clock.now(),issued=deps.tokens.issue();await db.client`INSERT INTO users(id,created_at,updated_at) VALUES(${id},${time},${time})`;
  await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES(${id},${id},${issued.tokenHash},${time},${new Date(now+86400_000).toISOString()})`;
  if(i!==2)await db.client`INSERT INTO auth_identities(id,user_id,provider,subject,verified_at,created_at) VALUES(${'phone_'+id},${id},'phone',${'+1202555010'+i},${time},${time})`;
  actors.push({userId:id,authenticatedAt:time,sessionHash:issued.tokenHash});
 }
});
after(async()=>{if(db)await p.closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await p.closeDatabase(admin);}});
test('campaign defaults inactive, phone proof is required and parallel repeated claims return one entitlement',{skip:!enabled},async()=>{
 assert.equal((await a.getWelcomePromotion({},deps)).value.available,false);
 const time=deps.clock.now();await db.client`UPDATE promotion_campaigns SET status='active',starts_at=${time},ends_at=${new Date(now+86400_000).toISOString()},approved_at=${time},approved_by='synthetic-operator',approval_ref='synthetic-acceptance' WHERE id='welcome_v3'`;
 assert.equal((await a.claimWelcomePromotion({actor:actors[2]},deps)).ok,false);
 const claims=await Promise.all(Array.from({length:8},()=>a.claimWelcomePromotion({actor:actors[0]},deps)));assert.equal(claims.every(x=>x.ok),true);assert.equal(new Set(claims.map(x=>x.value.entitlementId)).size,1);assert.equal(claims[0].value.code,'YUBIE15');
 assert.equal((await db.client`SELECT id FROM promotion_entitlements`).length,1);
 assert.equal((await a.claimWelcomePromotion({actor:{...actors[0],userId:actors[1].userId}},deps)).ok,false);
});
test('paid account history excludes eligibility; an unauthenticated delivery phone does not establish ownership',{skip:!enabled},async()=>{
 const time=deps.clock.now();await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,user_id,customer_email,status,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('prior_paid','prior_paid','synthetic_prior_paid',${actors[1].userId},'synthetic@example.invalid','paid',10000,10000,10000,${time},${time})`;
 assert.equal((await a.claimWelcomePromotion({actor:actors[1]},deps)).ok,false);
 await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,customer_email,status,delivery_jsonb,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('guest_paid','guest_paid','synthetic_guest_paid','synthetic@example.invalid','paid',${JSON.stringify({phone:'+12025550103'})}::jsonb,10000,10000,10000,${time},${time})`;
 const repeated=await a.claimWelcomePromotion({actor:actors[3]},deps);assert.equal(repeated.ok,true);
 assert.equal((await a.getWelcomePromotion({},deps)).value.code,undefined);
});

test('leaked code cannot create a payable checkout, and verified entitlement discounts server prices once',{skip:!enabled},async()=>{
 const calls=[];const provider={async createPaymentSession(input){calls.push(input);assert.equal(input.items.reduce((sum,line)=>sum+line.netUnitAmount*line.quantity,0),input.amount);return{ok:true,value:{providerSessionId:'synthetic_session_'+input.referenceId,redirectUrl:'https://payments.invalid/synthetic',expiresAt:new Date(now+3600_000).toISOString(),rawStatus:'ACTIVE'}};},async getPaymentSession(){return{ok:true,value:null};},async cancelPaymentSession(){return{ok:true,value:{accepted:true}};}};
 const base={lines:[{productId:'flour',sizeId:'250g',quantity:2}],customerEmail:'synthetic@example.invalid',successReturnUrl:'https://local.test/checkout/success',cancelReturnUrl:'https://local.test/checkout/cancel',idempotencyPrincipal:'guest:'+'a'.repeat(64),idempotencyKey:randomUUID(),promoCode:'YUBIE15'};
 const unauthorized=await a.createFirstPartyCheckout(base,{...deps,provider});assert.equal(unauthorized.ok,false);assert.equal(calls.length,0);
 const input={...base,idempotencyPrincipal:'user:'+actors[0].userId,userId:actors[0].userId,customerProof:actors[0],idempotencyKey:randomUUID()};
 const first=await a.createFirstPartyCheckout(input,{...deps,provider});assert.equal(first.ok,true);assert.equal(first.value.totalAmount,59500);assert.equal(calls.length,1);
 const repeated=await a.createFirstPartyCheckout(input,{...deps,provider});assert.equal(repeated.ok,true);assert.equal(repeated.value.checkoutToken,first.value.checkoutToken);assert.equal(calls.length,1);
 const [reserved]=await db.client`SELECT * FROM promotion_redemptions WHERE user_id=${actors[0].userId}`;assert.equal(reserved.state,'reserved');assert.equal(reserved.discount_amount,10500);
 const other=await a.createFirstPartyCheckout({...input,userId:actors[3].userId,customerProof:actors[3],idempotencyPrincipal:'user:'+actors[3].userId,lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyKey:randomUUID()},{...deps,provider});assert.equal(other.ok,true);
});

async function transition(orderId,status){return deps.tx.run('test.promotion_transition',async repos=>{
 const payments=await repos.payments.findByOrderId(orderId);assert.equal(payments.ok,true);const locked=await repos.payments.lockById(payments.value[0].id);assert.equal(locked.ok,true);const order=await repos.orders.findById(orderId);assert.equal(order.ok,true);
 return a.applyPaymentStatus({...repos,clock:deps.clock,ids:deps.ids},locked.value,order.value,status);
});}
test('success consumes once, refunds retain consumption and failure releases eligibility',{skip:!enabled},async()=>{
 const [first]=await db.client`SELECT * FROM promotion_redemptions WHERE user_id=${actors[0].userId}`;
 assert.equal(await transition(first.order_id,'succeeded'),'applied');const [paid]=await db.client`SELECT * FROM promotion_redemptions WHERE id=${first.id}`;assert.equal(paid.state,'consumed');
 now+=1000;assert.equal(await transition(first.order_id,'succeeded'),'already_applied');await transition(first.order_id,'refunded');
 const [refund]=await db.client`SELECT * FROM promotion_redemptions WHERE id=${first.id}`;assert.equal(refund.state,'consumed');assert.equal(Date.parse(refund.consumed_at),Date.parse(paid.consumed_at));assert.equal((await a.claimWelcomePromotion({actor:actors[0]},deps)).ok,false);
 const [second]=await db.client`SELECT * FROM promotion_redemptions WHERE user_id=${actors[3].userId}`;await transition(second.order_id,'failed');assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE id=${second.id}`)[0].state,'released');
 const provider={async createPaymentSession(){return{ok:false,error:{code:'validation',message:'synthetic definitive rejection',retryable:false,requestId:'synthetic'}};},async getPaymentSession(){return{ok:true,value:null};},async cancelPaymentSession(){return{ok:true,value:{accepted:false}};}};
 const retry=await a.createFirstPartyCheckout({lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actors[3].userId,customerProof:actors[3],promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actors[3].userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{...deps,provider});assert.equal(retry.ok,false);
 const rows=await db.client`SELECT state FROM promotion_redemptions WHERE user_id=${actors[3].userId}`;assert.equal(rows.length,2);assert.equal(rows.every(row=>row.state==='released'),true);
});
test('ambiguous provider creation retains promotion across local expiry and retries',{skip:!enabled},async()=>{
 assert.equal((await a.claimWelcomePromotion({actor:actors[4]},deps)).ok,true);let calls=0;
 const provider={async createPaymentSession(){calls++;throw Error('synthetic lost acknowledgment');},async getPaymentSession(){return{ok:true,value:null};},async cancelPaymentSession(){return{ok:true,value:{accepted:false}};}};
 const input={lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actors[4].userId,customerProof:actors[4],promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actors[4].userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'};
 assert.equal((await a.createFirstPartyCheckout(input,{...deps,provider})).ok,false);assert.equal((await a.createFirstPartyCheckout(input,{...deps,provider})).ok,false);assert.equal(calls,1);
 now+=16*60_000;await a.reconcilePayments({...deps,provider,orders:new p.PostgresOrderRepository(db),payments:new p.PostgresPaymentRepository(db)});
 assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE user_id=${actors[4].userId}`)[0].state,'reserved');
});
test('crash window during provider create is marked before sending and cannot release a stale draft',{skip:!enabled},async()=>{
 assert.equal((await a.claimWelcomePromotion({actor:actors[5]},deps)).ok,true);let finish;const entered=Promise.withResolvers();
 const provider={async createPaymentSession(){entered.resolve();return new Promise(resolve=>{finish=resolve;});},async getPaymentSession(){return{ok:true,value:null};},async cancelPaymentSession(){return{ok:true,value:{accepted:false}};}};
 const input={lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actors[5].userId,customerProof:actors[5],promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actors[5].userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'};
 const running=a.createFirstPartyCheckout(input,{...deps,provider});await entered.promise;now+=16*60_000;
 const report=await a.reconcilePayments({...deps,provider,orders:new p.PostgresOrderRepository(db),payments:new p.PostgresPaymentRepository(db)});assert.equal(report.value.staleDraftsCancelled,0);
 assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE user_id=${actors[5].userId}`)[0].state,'reserved');
 finish({ok:false,error:{code:'validation',message:'synthetic definitive rejection',retryable:false,requestId:'synthetic'}});await running;
 assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE user_id=${actors[5].userId}`)[0].state,'released');
});
