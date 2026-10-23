import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile,readdir} from 'node:fs/promises';import * as p from '../dist/index.js';import * as a from '@yubie/application';
const enabled=!!process.env.DATABASE_URL;let admin,db,name,now,deps,actors;
before(async()=>{
 if(!enabled)return;admin=p.createDatabase(process.env.DATABASE_URL);name='promotions_v3_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=p.createDatabase(url.toString());
 const dir=new URL('../migrations/',import.meta.url);for(const f of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
  if(f.startsWith('0019_')){
   const time='2026-10-23T12:00:00.000Z';
   await db.client`INSERT INTO users(id,google_sub,created_at,updated_at) VALUES('legacy_promo','synthetic_google_promo',${time},${time})`;
   await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,user_id,customer_email,status,subtotal_amount,discount_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('legacy_promo_order','legacy_promo_ref','synthetic_promo_token','legacy_promo','synthetic@example.invalid','paid',70000,10500,59500,59500,${time},${time})`;
  }
  await db.client.begin(async s=>s.unsafe(await readFile(new URL(f,dir),'utf8')));
 }
 now=Date.parse('2026-10-23T12:00:00Z');deps={tx:new p.PostgresTransactionManager(db),clock:{now:()=>new Date(now).toISOString()},ids:{nextId:()=>randomUUID()},tokens:new a.CryptoSessionTokenService()};actors=[];
 for(let i=0;i<12;i++){
  const id='promo_user_'+i,time=deps.clock.now(),issued=deps.tokens.issue();await db.client`INSERT INTO users(id,created_at,updated_at) VALUES(${id},${time},${time})`;
  await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES(${id},${id},${issued.tokenHash},${time},${new Date(now+86400_000).toISOString()})`;
  if(i!==2)await db.client`INSERT INTO auth_identities(id,user_id,provider,subject,verified_at,created_at) VALUES(${'phone_'+id},${id},'phone',${'+120255501'+String(i).padStart(2,'0')},${time},${time})`;
  actors.push({userId:id,authenticatedAt:time,sessionHash:issued.tokenHash});
 }
});
after(async()=>{if(db)await p.closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await p.closeDatabase(admin);}});
test('0019 preserves historical accounts and confirmed discounted monetary snapshots',{skip:!enabled},async()=>{
 const [user]=await db.client`SELECT google_sub FROM users WHERE id='legacy_promo'`;assert.equal(user.google_sub,'synthetic_google_promo');
 const [order]=await db.client`SELECT status,subtotal_amount,discount_amount,grand_total_amount,total_amount FROM orders WHERE id='legacy_promo_order'`;
 assert.deepEqual(order,{status:'paid',subtotal_amount:70000,discount_amount:10500,grand_total_amount:59500,total_amount:59500});
 assert.equal((await db.client`SELECT id FROM promotion_redemptions WHERE order_id='legacy_promo_order'`).length,0);
});
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
 const base={provider:'ipaymu',lines:[{productId:'flour',sizeId:'250g',quantity:2}],customerEmail:'synthetic@example.invalid',successReturnUrl:'https://local.test/checkout/success',cancelReturnUrl:'https://local.test/checkout/cancel',idempotencyPrincipal:'guest:'+'a'.repeat(64),idempotencyKey:randomUUID(),promoCode:'YUBIE15'};
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

test('a pending promotional checkout blocks a competing full-price attempt',{skip:!enabled},async()=>{
 let calls=0;const provider={async createPaymentSession(){calls++;throw Error('must not create');}};
 const result=await a.createFirstPartyCheckout({lines:[{productId:'shake',sizeId:'sachet',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actors[4].userId,idempotencyPrincipal:'user:'+actors[4].userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{...deps,provider});
 assert.equal(result.ok,false);assert.equal(result.error.code,'pending_reconciliation');assert.equal(calls,0);
});
test('parallel payable attempts share one reservation and provider create',{skip:!enabled},async()=>{
 let calls=0;const provider={async createPaymentSession(input){calls++;await new Promise(resolve=>setTimeout(resolve,20));return{ok:true,value:{providerSessionId:'synthetic_'+input.referenceId,redirectUrl:'https://payments.invalid/synthetic',rawStatus:'ACTIVE',expiresAt:null}};}};
 const input={lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actors[3].userId,customerProof:actors[3],promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actors[3].userId,successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'};
 const results=await Promise.all(Array.from({length:8},()=>a.createFirstPartyCheckout({...input,idempotencyKey:randomUUID()},{...deps,provider})));
 assert.equal(calls,1);assert.equal(results.every(result=>result.ok||result.error.code==='pending_reconciliation'),true);assert.equal((await db.client`SELECT id FROM promotion_redemptions WHERE user_id=${actors[3].userId} AND state='reserved'`).length,1);
});
test('grant and consumption audit failures roll back their complete business transactions',{skip:!enabled},async()=>{
 await db.client.unsafe("CREATE FUNCTION reject_promotion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN('promotion.entitled','promotion.consumed') THEN RAISE EXCEPTION 'synthetic promotion audit outage'; END IF; RETURN NEW; END $$");
 await db.client.unsafe("CREATE TRIGGER reject_promotion_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_promotion_audit()");
 const [redemption]=await db.client`SELECT * FROM promotion_redemptions WHERE user_id=${actors[3].userId} AND state='reserved'`;
 try{
  const failed=await a.claimWelcomePromotion({actor:actors[6]},deps);assert.equal(failed.ok,false);assert.equal(failed.error.code,'unavailable');assert.equal((await db.client`SELECT id FROM promotion_entitlements WHERE user_id=${actors[6].userId}`).length,0);
  await assert.rejects(()=>transition(redemption.order_id,'succeeded'));assert.equal((await db.client`SELECT status FROM order_payments WHERE order_id=${redemption.order_id}`)[0].status,'pending');assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE id=${redemption.id}`)[0].state,'reserved');
 }finally{await db.client.unsafe('DROP TRIGGER reject_promotion_audit ON audit_events');await db.client.unsafe('DROP FUNCTION reject_promotion_audit()');}
 assert.equal((await a.claimWelcomePromotion({actor:actors[6]},deps)).ok,true);await transition(redemption.order_id,'succeeded');assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE id=${redemption.id}`)[0].state,'consumed');
});
test('attach-failure cancellation releases the promotion and permits a new attempt',{skip:!enabled},async()=>{
 const actor=actors[7];assert.equal((await a.claimWelcomePromotion({actor},deps)).ok,true);
 const input={lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actor.userId,customerProof:actor,promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actor.userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'};
 const provider={async createPaymentSession(input){return{ok:true,value:{providerSessionId:'attach_'+input.referenceId,redirectUrl:'https://payments.invalid/synthetic',rawStatus:'ACTIVE',expiresAt:null}};},async getPaymentSession(){return{ok:true,value:{rawStatus:'ACTIVE'}};},async cancelPaymentSession(){return{ok:true,value:{accepted:true}};}};
 const broken={...deps,tx:{run(label,fn){if(label==='checkout.attach_session')throw Error('synthetic attach outage');return deps.tx.run(label,fn);}}};
 assert.equal((await a.createFirstPartyCheckout(input,{...broken,provider})).ok,false);
 now+=16*60_000;await a.reconcilePayments({...deps,provider,orders:new p.PostgresOrderRepository(db),payments:new p.PostgresPaymentRepository(db)});
 assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE user_id=${actor.userId}`)[0].state,'released');
 assert.equal((await a.createFirstPartyCheckout({...input,idempotencyKey:randomUUID()},{...deps,provider})).ok,true);
});
test('provider return cannot overwrite an authoritative payment received during create',{skip:!enabled},async()=>{
 for(const [offset,outcome] of ['success','ambiguous','rejected'].entries()){
  const actor=actors[8+offset];assert.equal((await a.claimWelcomePromotion({actor},deps)).ok,true);let orderId;
  const provider={async createPaymentSession(input){
   const [order]=await db.client`SELECT id FROM orders WHERE checkout_ref=${input.referenceId}`;orderId=order.id;
   const webhook=await a.processPaymentWebhook({callbackToken:'synthetic-callback',expectedToken:'synthetic-callback',expectedBusinessId:'synthetic-business',payload:{event:'payment_session.completed',business_id:'synthetic-business',data:{payment_session_id:'race_'+input.referenceId,reference_id:input.referenceId,currency:'IDR',amount:input.amount,status:'COMPLETED'}}},deps);
   assert.equal(webhook.result,'applied');
   if(outcome!=='success')return{ok:false,error:{code:outcome==='rejected'?'validation':'timeout',message:'synthetic provider response',retryable:true,requestId:'synthetic'}};
   return{ok:true,value:{providerSessionId:'race_'+input.referenceId,redirectUrl:'https://payments.invalid/synthetic',rawStatus:'ACTIVE',expiresAt:null}};
  }};
  await a.createFirstPartyCheckout({lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actor.userId,customerProof:actor,promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actor.userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{...deps,provider});
  assert.equal((await db.client`SELECT status FROM order_payments WHERE order_id=${orderId}`)[0].status,'succeeded',outcome);
  assert.equal((await db.client`SELECT status FROM orders WHERE id=${orderId}`)[0].status,'paid',outcome);
  assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE order_id=${orderId}`)[0].state,'consumed',outcome);
 }
});
test('concurrent duplicate orphan callbacks cannot reset a consumed payment to pending',{skip:!enabled},async()=>{
 const actor=actors[11];assert.equal((await a.claimWelcomePromotion({actor},deps)).ok,true);let orderId;
 const provider={async createPaymentSession(input){
  const [order]=await db.client`SELECT id FROM orders WHERE checkout_ref=${input.referenceId}`;orderId=order.id;
  const discovered=Promise.withResolvers(),firstCommitted=Promise.withResolvers();let reads=0;
  const tx={async run(label,fn){let first=false;
   const result=await deps.tx.run(label,repos=>fn({...repos,payments:new Proxy(repos.payments,{get(target,key){
    if(key==='findByOrderId')return async id=>{const value=await target.findByOrderId(id);first=++reads===1;if(first)await discovered.promise;else{discovered.resolve();await firstCommitted.promise;}return value;};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
   }})}));if(first)firstCommitted.resolve();return result;
  }};
  const event={callbackToken:'synthetic-race',expectedToken:'synthetic-race',expectedBusinessId:'synthetic-business',payload:{event:'payment_session.completed',business_id:'synthetic-business',data:{payment_session_id:'duplicate_'+input.referenceId,reference_id:input.referenceId,currency:'IDR',amount:input.amount,status:'COMPLETED'}}};
  const results=await Promise.all([a.processPaymentWebhook(event,{...deps,tx}),a.processPaymentWebhook(event,{...deps,tx})]);assert.deepEqual(results.map(x=>x.result).sort(),['applied','duplicate']);
  assert.equal((await db.client`SELECT status FROM order_payments WHERE order_id=${orderId}`)[0].status,'succeeded');
  return{ok:false,error:{code:'timeout',message:'synthetic lost ack',retryable:true,requestId:'synthetic'}};
 }};
 const result=await a.createFirstPartyCheckout({lines:[{productId:'flour',sizeId:'250g',quantity:1}],customerEmail:'synthetic@example.invalid',userId:actor.userId,customerProof:actor,promoCode:'YUBIE15',idempotencyPrincipal:'user:'+actor.userId,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{...deps,provider});
 assert.equal(result.ok,true);assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE order_id=${orderId}`)[0].state,'consumed');
});
test('campaign and local payment expiry do not release an unknown financial outcome',{skip:!enabled},async()=>{
 now+=2*86400_000;const provider={async getPaymentSession(){return{ok:true,value:null};},async cancelPaymentSession(){return{ok:true,value:{accepted:false}};}};
 await a.reconcilePayments({...deps,provider,orders:new p.PostgresOrderRepository(db),payments:new p.PostgresPaymentRepository(db)});
 assert.equal((await a.getWelcomePromotion({},deps)).value.available,false);assert.equal((await db.client`SELECT state FROM promotion_redemptions WHERE user_id=${actors[4].userId}`)[0].state,'reserved');
});
