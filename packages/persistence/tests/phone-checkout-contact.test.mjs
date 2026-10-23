import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import * as p from '../dist/index.js';
import * as a from '@yubie/application';
const enabled=!!process.env.DATABASE_URL;
let admin,db,name;
before(async()=>{
 if(!enabled)return;
 admin=p.createDatabase(process.env.DATABASE_URL);name='checkout_contact_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=p.createDatabase(url.toString());
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of(await readdir(dir)).filter(file=>file.endsWith('.sql')).sort()){
  if(file.startsWith('0020_'))await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,customer_email,status,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('legacy_contact','legacy_contact','synthetic_contact_token','synthetic@example.invalid','paid',35000,35000,35000,'2026-10-23T12:00:00Z','2026-10-23T12:00:00Z')`;
  const source=await readFile(new URL(file,dir),'utf8');await db.client.begin(sql=>sql.unsafe(source));
 }
});
after(async()=>{if(db)await p.closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await p.closeDatabase(admin);}});
test('phone-only checkout persists null email while the historical email and money remain unchanged',{skip:!enabled},async()=>{
 const calls=[];
 const provider={async createPaymentSession(input){calls.push(input);return{ok:true,value:{providerSessionId:'synthetic_contact_session',redirectUrl:'https://payments.invalid/contact',rawStatus:'ACTIVE',expiresAt:null}};}};
 const deps={tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}};
 const result=await a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:'guest:'+'c'.repeat(64),idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},deps);
 assert.equal(result.ok,true);
 const [row]=await db.client`SELECT customer_email,customer_phone,total_amount FROM orders WHERE checkout_ref=${result.value.checkoutRef}`;
 assert.deepEqual(row,{customer_email:null,customer_phone:'+12025550100',total_amount:35000});assert.equal(calls[0].customerEmail,null);
 const order=await new p.PostgresOrderRepository(db).findByCheckoutRef(result.value.checkoutRef);assert.equal(order.value.customerEmail,null);assert.equal(order.value.customerPhone,'+12025550100');assert.equal(order.value.userId,null);
 await assert.rejects(()=>db.client`UPDATE orders SET customer_phone='unverified-text' WHERE id=${order.value.id}`);
 assert.equal((await new p.PostgresOrderRepository(db).findById(order.value.id)).value.customerPhone,'+12025550100');
 const [legacy]=await db.client`SELECT customer_email,customer_phone,total_amount,status FROM orders WHERE id='legacy_contact'`;assert.deepEqual(legacy,{customer_email:'synthetic@example.invalid',customer_phone:null,total_amount:35000,status:'paid'});
});

test('concurrent changed-cart submissions cannot create a second unresolved payment',{skip:!enabled},async()=>{
 let calls=0;const principal='guest:'+'d'.repeat(64);
 const provider={async createPaymentSession(input){calls++;await new Promise(resolve=>setTimeout(resolve,20));return{ok:true,value:{providerSessionId:'scope_'+input.referenceId,redirectUrl:'https://payments.invalid/scope',rawStatus:'ACTIVE',expiresAt:null}};}};
 const deps={tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}};
 const results=await Promise.all(Array.from({length:16},(_,index)=>a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',lines:[{productId:'flour',sizeId:'250g',quantity:index%2+1}],idempotencyPrincipal:principal,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},deps)));
 assert.equal(calls,1);assert.equal(results.every(result=>result.ok||result.error.code==='pending_reconciliation'),true);
 assert.equal((await db.client`SELECT id FROM order_payments WHERE principal_key=${principal}`).length,1);
});
test('login with a possessed guest attempt resumes it and does not rewrite guest identity',{skip:!enabled},async()=>{
 const time=new Date().toISOString();await db.client`INSERT INTO users(id,created_at,updated_at) VALUES('checkout_login',${time},${time})`;
 let calls=0;const provider={async createPaymentSession(){calls++;throw Error('must not create another payment');}};
 const result=await a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',userId:'checkout_login',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:'user:checkout_login',possessedGuestPrincipal:'guest:'+'c'.repeat(64),idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}});
 assert.equal(result.ok,true);assert.equal(calls,0);assert.equal((await new p.PostgresOrderRepository(db).findByCheckoutRef(result.value.checkoutRef)).value.userId,null);
 const afterCookieCleared=await a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',userId:'checkout_login',lines:[{productId:'flour',sizeId:'250g',quantity:2}],idempotencyPrincipal:'user:checkout_login',idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}});
 assert.equal(afterCookieCleared.ok,false);assert.equal(afterCookieCleared.error.code,'pending_reconciliation');assert.equal(calls,0);

});

async function verifiedActor(id){
 const time=new Date().toISOString(),tokens=new a.CryptoSessionTokenService(),issued=tokens.issue();
 await db.client`INSERT INTO users(id,created_at,updated_at) VALUES(${id},${time},${time}) ON CONFLICT DO NOTHING`;
 await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES(${id},${id},${issued.tokenHash},${time},${new Date(Date.now()+86400_000).toISOString()})`;
 await db.client`INSERT INTO auth_identities(id,user_id,provider,subject,verified_at,created_at) VALUES(${id},${id},'phone',${id==='checkout_login'?'+12025550100':id==='claim_owner'?'+12025550101':'+12025550102'},${time},${time})`;
 return{userId:id,sessionHash:issued.tokenHash,authenticatedAt:time};
}
test('proved guest purchase history remains ineligible after the recovery cookie is absent',{skip:!enabled},async()=>{
 const actor=await verifiedActor('checkout_login'),time=new Date().toISOString();
 await db.client`UPDATE promotion_campaigns SET status='active',starts_at=${time},ends_at=${new Date(Date.now()+86400_000).toISOString()},approved_at=${time},approved_by='synthetic-operator',approval_ref='synthetic-only' WHERE id='welcome_v3'`;
 await db.client`UPDATE orders SET status='paid' WHERE checkout_ref=(SELECT o.checkout_ref FROM orders o JOIN order_payments p ON p.order_id=o.id WHERE p.principal_key=${'guest:'+'c'.repeat(64)} LIMIT 1)`;
 const result=await a.claimWelcomePromotion({actor},{tx:new p.PostgresTransactionManager(db),clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'forbidden');
});
test('claiming with a possessed paid guest cookie retains proof association even after rejection',{skip:!enabled},async()=>{
 const actor=await verifiedActor('claim_owner'),time=new Date().toISOString(),guest='guest:'+'e'.repeat(64);
 await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,customer_email,status,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('claim_guest','claim_guest','synthetic_claim_guest',null,'paid',35000,35000,35000,${time},${time})`;
 await db.client`INSERT INTO order_payments(id,order_id,provider,principal_key,request_hash,status,currency,amount,created_at,updated_at) VALUES('claim_guest','claim_guest','xendit',${guest},${'e'.repeat(64)},'succeeded','IDR',35000,${time},${time})`;
 const deps={tx:new p.PostgresTransactionManager(db),clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}};
 assert.equal((await a.claimWelcomePromotion({actor,guestPrincipal:guest},deps)).ok,false);
 assert.equal((await a.claimWelcomePromotion({actor},deps)).ok,false);
 assert.equal((await db.client`SELECT user_id FROM checkout_guest_bindings WHERE guest_principal=${guest}`)[0].user_id,actor.userId);
});

test('another signed-in customer cannot take ownership of a bound recovery cookie',{skip:!enabled},async()=>{
 const time=new Date().toISOString();await db.client`INSERT INTO users(id,created_at,updated_at) VALUES('other_owner',${time},${time})`;
 let calls=0;const provider={async createPaymentSession(){calls++;throw Error('must not create');}};
 const result=await a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',userId:'other_owner',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:'user:other_owner',possessedGuestPrincipal:'guest:'+'c'.repeat(64),idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>time},ids:{nextId:()=>randomUUID()}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'conflict');assert.equal(calls,0);
 assert.equal((await db.client`SELECT user_id FROM checkout_guest_bindings WHERE guest_principal=${'guest:'+'c'.repeat(64)}`)[0].user_id,'checkout_login');
});
test('binding audit failure rolls back ownership and prevents provider creation',{skip:!enabled},async()=>{
 const guest='guest:'+'f'.repeat(64);let calls=0;
 const provider={async createPaymentSession(){calls++;throw Error('must not create');}};
 await db.client.unsafe("CREATE FUNCTION reject_checkout_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='checkout.guest_bound' THEN RAISE EXCEPTION 'synthetic audit outage'; END IF; RETURN NEW; END $$");
 await db.client.unsafe('CREATE TRIGGER reject_checkout_binding BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_checkout_binding()');
 try{
  await assert.rejects(()=>a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',userId:'other_owner',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:'user:other_owner',possessedGuestPrincipal:guest,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}}));
  assert.equal((await db.client`SELECT guest_principal FROM checkout_guest_bindings WHERE guest_principal=${guest}`).length,0);assert.equal(calls,0);
 }finally{await db.client.unsafe('DROP TRIGGER reject_checkout_binding ON audit_events');await db.client.unsafe('DROP FUNCTION reject_checkout_binding()');}
});
test('multiple historical unresolved attempts block new checkout without selecting a winner',{skip:!enabled},async()=>{
 const principal='guest:'+'d'.repeat(64),time=new Date().toISOString();
 await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,customer_email,status,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('historical_extra','historical_extra','synthetic_historical_extra',null,'draft',35000,35000,35000,${time},${time})`;
 await db.client`INSERT INTO order_payments(id,order_id,provider,principal_key,request_hash,status,currency,amount,created_at,updated_at) VALUES('historical_extra','historical_extra','xendit',${principal},${'f'.repeat(64)},'pending','IDR',35000,${time},${time})`;
 let calls=0;const provider={async createPaymentSession(){calls++;throw Error('must not select a financial winner');}};
 const result=await a.createFirstPartyCheckout({checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:principal,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'},{tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>time},ids:{nextId:()=>randomUUID()}});
 assert.equal(result.ok,false);assert.equal(result.error.code,'pending_reconciliation');assert.equal(calls,0);assert.equal((await db.client`SELECT id FROM order_payments WHERE principal_key=${principal}`).length,2);
});

test('scoped recovery survives withdrawn products for new keys and guest login',{skip:!enabled},async()=>{
 const {productFamilies}=await import('@yubie/domain'),guest='guest:'+'1'.repeat(64);let calls=0;
 const provider={async createPaymentSession(input){calls++;return{ok:true,value:{providerSessionId:'withdraw_'+input.referenceId,redirectUrl:'https://payments.invalid/withdraw',rawStatus:'ACTIVE',expiresAt:null}};}};
 const deps={tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>new Date().toISOString()},ids:{nextId:()=>randomUUID()}};
 const input={checkoutVersion:3,customerEmail:null,customerPhone:'+12025550100',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:guest,idempotencyKey:randomUUID(),successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'};
 const original=await a.createFirstPartyCheckout(input,deps);assert.equal(original.ok,true);
 const time=deps.clock.now();await db.client`INSERT INTO users(id,created_at,updated_at) VALUES('withdraw_login',${time},${time})`;
 const product=productFamilies.find(product=>product.id==='flour'),previous=product.status;
 try{
  product.status='coming_soon';
  const changedKey=await a.createFirstPartyCheckout({...input,idempotencyKey:randomUUID()},deps);assert.equal(changedKey.ok,true);assert.equal(changedKey.value.checkoutToken,original.value.checkoutToken);
  const login=await a.createFirstPartyCheckout({...input,userId:'withdraw_login',idempotencyPrincipal:'user:withdraw_login',possessedGuestPrincipal:guest,idempotencyKey:randomUUID()},deps);assert.equal(login.ok,true);assert.equal(login.value.checkoutToken,original.value.checkoutToken);assert.equal(calls,1);
 }finally{product.status=previous;}
});
test('checkout promo rejection retains proved guest history when its cookie is later absent',{skip:!enabled},async()=>{
 const actor=await verifiedActor('paid_checkout_owner'),guest='guest:'+'2'.repeat(64),time=new Date().toISOString();let calls=0;
 const provider={async createPaymentSession(input){calls++;return{ok:true,value:{providerSessionId:'must_not_'+input.referenceId,redirectUrl:'https://payments.invalid/synthetic',rawStatus:'ACTIVE',expiresAt:null}};}};
 const deps={tx:new p.PostgresTransactionManager(db),provider,clock:{now:()=>time},ids:{nextId:()=>randomUUID()}};
 assert.equal((await a.claimWelcomePromotion({actor},deps)).ok,true);
 await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,customer_email,status,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('checkout_paid_guest','checkout_paid_guest','synthetic_checkout_paid_guest',null,'paid',35000,35000,35000,${time},${time})`;
 await db.client`INSERT INTO order_payments(id,order_id,provider,principal_key,request_hash,status,currency,amount,created_at,updated_at) VALUES('checkout_paid_guest','checkout_paid_guest','xendit',${guest},${'2'.repeat(64)},'succeeded','IDR',35000,${time},${time})`;
 const input={checkoutVersion:3,customerEmail:null,customerPhone:'+12025550102',userId:actor.userId,customerProof:actor,promoCode:'YUBIE15',lines:[{productId:'flour',sizeId:'250g',quantity:1}],idempotencyPrincipal:'user:'+actor.userId,successReturnUrl:'https://local.test/success',cancelReturnUrl:'https://local.test/cancel'};
 const rejected=await a.createFirstPartyCheckout({...input,possessedGuestPrincipal:guest,idempotencyKey:randomUUID()},deps);assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'forbidden');
 const retry=await a.createFirstPartyCheckout({...input,idempotencyKey:randomUUID()},deps);assert.equal(retry.ok,false);assert.equal(retry.error.code,'forbidden');assert.equal(calls,0);
 assert.equal((await db.client`SELECT user_id FROM checkout_guest_bindings WHERE guest_principal=${guest}`)[0].user_id,actor.userId);
});
