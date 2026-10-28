import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import postgres from "postgres";
import * as persistence from "../dist/index.js";
import { PostgresShippingPolicyRepository } from '../dist/repositories/shipping-policy-repository.js';
import { createFirstPartyCheckout, FixedClock, CryptoIdGenerator } from '@yubie/application';
import * as application from '@yubie/application';

test("operations repository exposes the shared transactional workflow",()=>assert.equal(typeof persistence.PostgresOperations,"function"));
test("PG: release independently verifies operations tables and triggers",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db)=>{
 const rows=await db.client.unsafe(readFileSync(new URL('../../../scripts/production/schema_checks.sql',import.meta.url),'utf8'));
 const checks=Object.values(rows[0])[0];assert.deepEqual(Object.entries(checks).filter(([,value])=>value!==true),[]);
}));
test("PG: admin never labels a released lot without QC evidence as sellable",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await db.client`INSERT INTO inventory_lots(id,product_id,size_id,lot_code,quantity_on_hand,expiry_date,status,created_at,updated_at) VALUES('TEST_ONLY_NO_QC','shake','sachet','TEST_ONLY_NO_QC',20,'2100-01-01','released',now(),now())`;
 const rows=await new persistence.PostgresAdminReaders(db).listInventory({limit:20,cursor:null});assert.equal(rows.items[0].availableQuantity,0);
 assert.equal((await ops.report('reader',new Date().toISOString().slice(0,10))).inventory.available_units,0);
}));
test("PG: operational freeze is shared with customer checkout and required for stock apply",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await db.client`DELETE FROM ops_checkout_freeze`;
 const inventory=new persistence.PostgresInventoryRepository(db);
 assert.equal(await inventory.checkoutFrozen(),false);
 await ops.freezeCheckout('counter','freeze',{reason:'TEST_ONLY physical count freeze'});
 assert.equal(await inventory.checkoutFrozen(),true);
 let creates=0;
 const result=await createFirstPartyCheckout({lines:[{productId:'shake',sizeId:'sachet',quantity:1}],provider:'ipaymu',inventoryMode:'lots',customerEmail:'TEST_ONLY@example.invalid',successReturnUrl:'https://sandbox.example.invalid/return',cancelReturnUrl:'https://sandbox.example.invalid/cancel',idempotencyPrincipal:'guest:'+'a'.repeat(64),idempotencyKey:'TEST_ONLY_FREEZE'}, {tx:new persistence.PostgresTransactionManager(db),provider:{createPaymentSession:async()=>{creates++;throw new Error('Must never create a session');}},clock:new FixedClock(new Date().toISOString()),ids:new CryptoIdGenerator()});
 assert.equal(result.ok,false);assert.equal(result.error.code,'checkout_safety_hold');assert.equal(creates,0);
 const input=intake(),draft=await ops.create('counter','frozen_count',{kind:'inventory_count',payload:input});
 await ops.approve('reviewer','frozen_qc',draft.id,{expectedVersion:1,reason:'TEST_ONLY QC'});
 await db.client`UPDATE ops_checkout_freeze SET started_at=now()-interval '30 minutes',expires_at=now()-interval '1 second'`;
 await assert.rejects(()=>ops.apply('counter','unfrozen_apply',draft.id,{expectedVersion:2,reason:'TEST_ONLY count'}),/freeze|disabled/i);
}));
test("PG: release schema proof rejects no-op audit and immutability functions",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db)=>{
 await db.client.unsafe("CREATE OR REPLACE FUNCTION ops_event_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$; CREATE OR REPLACE FUNCTION ops_request_payload_is_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;");
 const rows=await db.client.unsafe(readFileSync(new URL('../../../scripts/production/schema_checks.sql',import.meta.url),'utf8'));const checks=Object.values(rows[0])[0];assert.equal(checks.operationsAppendOnly,false);assert.equal(checks.operationsImmutablePayload,false);
}));

async function isolated(work){
 const admin=postgres(process.env.DATABASE_URL,{max:1});const name=`yubie_ops_test_${Date.now()}_${Math.floor(Math.random()*10000)}`;
 await admin`CREATE DATABASE ${admin(name)}`;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
 const db=persistence.createDatabase(url.toString());
 try{
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await db.client.unsafe(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  for(const [sub,roles] of [['counter',['operator','qc']],['reviewer',['qc']],['finance1',['finance']],['finance2',['finance']],['packer',['fulfillment']],['reader',['viewer']],['owner',['admin']]])for(const role of roles)await db.client`INSERT INTO ops_staff_grants(subject,role,granted_by,approval_ref,granted_at) VALUES(${sub},${role},'TEST_ONLY_BOOTSTRAP','TEST_ONLY_APPROVAL',now())`;
  await db.client`INSERT INTO ops_checkout_freeze(id,requested_by,reason,started_at,expires_at) VALUES('operations','TEST_ONLY_OPERATOR','TEST_ONLY count freeze',now(),now()+interval '30 minutes')`;
  await work(db,new persistence.PostgresOperations(db,{writesEnabled:true,checkoutAdmission:'disabled'}));
 }finally{await persistence.closeDatabase(db);await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;await admin.end();}
}
function intake(){const now=new Date().toISOString();return {documentType:'YUBIE_VERIFIED_INVENTORY_INTAKE_V1',purpose:'operational_count',sourceSha256:'a'.repeat(64),verification:{status:'VERIFIED',evidenceRef:'TEST_ONLY_COUNT',verifiedBy:'counter',verifiedAt:now},inventory:{operationId:'TEST_ONLY_COUNT_OP',actor:'counter',reason:'Isolated synthetic fixture, never production',countedAt:now,policies:[{productId:'shake',sizeId:'sachet',version:1,approvalRef:'TEST_ONLY_PACK',components:[{productId:'shake',sizeId:'sachet',quantity:1}]}],lots:[{productId:'shake',sizeId:'sachet',lotCode:'TEST_ONLY_LOT',unitOfMeasure:'sachet',expiryDate:'2100-01-01',countedUncommittedQuantity:1,expectedAvailable:0,status:'released',qcApprovalRef:'TEST_ONLY_QC'}]}};}

test("PG: approved count is atomic, replay-safe and cannot be self-approved",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const draft=await ops.create('counter','create_count',{kind:'inventory_count',payload:intake()});
 assert.equal((await db.client`SELECT count(*)::int n FROM inventory_lots`)[0].n,0);
 await assert.rejects(()=>ops.approve('counter','self',draft.id,{expectedVersion:1,reason:'Invalid self approval'}),/different|berbeda/i);
 await ops.approve('reviewer','approve_count',draft.id,{expectedVersion:1,reason:'TEST_ONLY reviewed physical evidence'});
 const applied=await ops.apply('counter','apply_count',draft.id,{expectedVersion:2,reason:'TEST_ONLY confirmed count'});
 assert.deepEqual(await ops.apply('counter','apply_count',draft.id,{expectedVersion:2,reason:'TEST_ONLY confirmed count'}),applied);
 assert.equal((await db.client`SELECT quantity_on_hand FROM inventory_lots`)[0].quantity_on_hand,1);
 assert.equal((await db.client`SELECT count(*)::int n FROM inventory_movements`)[0].n,1);
 await assert.rejects(()=>ops.apply('counter','apply_count',draft.id,{expectedVersion:2,reason:'Changed identity payload'}),/idempotency|identity/i);
 await assert.rejects(()=>db.client`UPDATE ops_events SET action='tamper'`,/append-only/i);
}));
test("PG: revoked QC grant and admission enabled prevent inventory apply",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const draft=await ops.create('counter','create_count',{kind:'inventory_count',payload:intake()});
 await ops.approve('reviewer','approve_count',draft.id,{expectedVersion:1,reason:'TEST_ONLY QC'});
 const live=new persistence.PostgresOperations(db,{writesEnabled:true,checkoutAdmission:'enabled'});
 await assert.rejects(()=>live.apply('counter','live_apply',draft.id,{expectedVersion:2,reason:'Must freeze first'}),/disabled|freeze/i);
 await db.client`UPDATE ops_staff_grants SET revoked_at=now() WHERE subject='reviewer'`;
 await assert.rejects(()=>ops.apply('counter','revoked_apply',draft.id,{expectedVersion:2,reason:'Must reject revoked QC'}),/permission|revoked|izin/i);
 assert.equal((await db.client`SELECT count(*)::int n FROM inventory_lots`)[0].n,0);
}));
test("PG: shipping requires Finance approval and writes the audited approval once",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const now=Date.now();const payload={scope:'whole_city',policy:'free_promotional',cities:['TEST_ONLY_CITY'],amount:0,serviceCoverage:'TEST_ONLY_SERVICE',costOwner:'TEST_ONLY_FINANCE',startsAt:new Date(now-60000).toISOString(),endsAt:new Date(now+3600000).toISOString(),approvalRef:'TEST_ONLY_SHIPPING',verification:{status:'VERIFIED',evidenceRef:'TEST_ONLY_DOC',verifiedBy:'finance1',verifiedAt:new Date(now).toISOString()}};
 const draft=await ops.create('counter','shipping_create',{kind:'shipping_policy',payload});
 await assert.rejects(()=>ops.approve('reviewer','wrong_role',draft.id,{expectedVersion:1,reason:'QC is not Finance'}),/permission|izin/i);
 await ops.approve('finance1','shipping_approve',draft.id,{expectedVersion:1,reason:'TEST_ONLY budget approval'});
 await ops.apply('counter','shipping_apply',draft.id,{expectedVersion:2,reason:'TEST_ONLY explicit coverage'});
 assert.equal((await db.client`SELECT count(*)::int n FROM shipping_policy_approvals`)[0].n,1);
 assert.equal((await db.client`SELECT approved_by FROM shipping_policy_approvals`)[0].approved_by,'finance1');
 assert.equal((await new PostgresShippingPolicyRepository(db).authorize('TEST_ONLY_CITY',new Date().toISOString())).amount,0);
 assert.equal(await new PostgresShippingPolicyRepository(db).authorize('TEST_ONLY_OTHER_CITY',new Date().toISOString()),null);
 await db.client`UPDATE shipping_policy_approvals SET scope=NULL`;
 assert.equal(await new PostgresShippingPolicyRepository(db).authorize('TEST_ONLY_CITY',new Date().toISOString()),null);
}));
test("PG: missing audit capability rolls back draft creation",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await db.client.unsafe("CREATE FUNCTION test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_ONLY audit failure'; END; $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_audit_failure();");
 await assert.rejects(()=>ops.create('counter','rollback_count',{kind:'inventory_count',payload:intake()}),/audit/i);
 assert.equal((await db.client`SELECT count(*)::int n FROM ops_requests`)[0].n,0);
}));
test("PG: idempotent response cannot bypass a revoked operation permission",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const input=intake();
 const draft=await ops.create('counter','create_count',{kind:'inventory_count',payload:input});
 await db.client`UPDATE ops_staff_grants SET revoked_at=now() WHERE subject='counter' AND role='operator'`;
 await assert.rejects(()=>ops.create('counter','create_count',{kind:'inventory_count',payload:input}),/permission|izin/i);
 assert.equal((await db.client`SELECT count(*)::int n FROM ops_requests`)[0].n,1);
}));
test("PG: immutable draft payload cannot be replaced after approval",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const draft=await ops.create('counter','create_count',{kind:'inventory_count',payload:intake()});
 await ops.approve('reviewer','approve_count',draft.id,{expectedVersion:1,reason:'TEST_ONLY review'});
 await assert.rejects(()=>db.client`UPDATE ops_requests SET payload_json='{}'::jsonb WHERE id=${draft.id}`,/immutable/i);
}));
async function paid(db){
 await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,status,customer_name,customer_phone,delivery_jsonb,currency,subtotal_amount,discount_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('TEST_ONLY_ORDER','TEST_ONLY_REF','TEST_ONLY_PUBLIC_TOKEN','paid','TEST_ONLY_CUSTOMER','+6200000000000','{"city":"TEST_ONLY_CITY"}'::jsonb,'IDR',35000,0,35000,35000,now(),now())`;
 await db.client`INSERT INTO order_payments(id,order_id,provider,provider_session_id,provider_payment_id,currency,status,amount,created_at,updated_at) VALUES('TEST_ONLY_PAYMENT','TEST_ONLY_ORDER','ipaymu','TEST_ONLY_SESSION','1001','IDR','succeeded',35000,now(),now())`;
}
test("PG: Finance reconciliation actually queries the requested non-expired payment",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db)=>{
 await paid(db);await db.client`UPDATE orders SET status='pending_payment' WHERE id='TEST_ONLY_ORDER'`;await db.client`UPDATE order_payments SET status='pending',expires_at=now()+interval '1 day' WHERE id='TEST_ONLY_PAYMENT'`;
 const payments=new persistence.PostgresPaymentRepository(db);assert.equal((await payments.listPendingExpired(new Date().toISOString(),50)).value.length,0);
 const lookups=[];const provider={getPaymentSession:async(id,lookup)=>{lookups.push({id,lookup});return{ok:true,value:{provider:'ipaymu',providerSessionId:'TEST_ONLY_SESSION',providerPaymentId:'1001',referenceId:'TEST_ONLY_REF',providerBusinessId:'TEST_ONLY_MERCHANT',currency:'IDR',amount:35000,rawStatus:'SUCCEEDED',redirectUrl:'',expiresAt:null}};},createPaymentSession:async()=>{throw new Error('No payable create allowed');}};
 const deps={tx:new persistence.PostgresTransactionManager(db),provider,merchant:'TEST_ONLY_MERCHANT',clock:new FixedClock(new Date().toISOString()),ids:new CryptoIdGenerator()};
 await application.reconcileIpaymuPayment('TEST_ONLY_PAYMENT',deps);
 assert.equal(lookups.length,1);assert.equal(lookups[0].lookup.providerPaymentId,'1001');assert.equal((await db.client`SELECT status FROM order_payments`)[0].status,'succeeded');
 assert.equal((await db.client`SELECT event FROM payment_events`)[0].event,'ipaymu.poll');
 provider.getPaymentSession=async()=>({ok:true,value:{provider:'ipaymu',providerSessionId:'TEST_ONLY_SESSION',providerPaymentId:'1001',referenceId:'TEST_ONLY_REF',providerBusinessId:'TEST_ONLY_MERCHANT',currency:'IDR',amount:35000,rawStatus:'REFUNDED',redirectUrl:'',expiresAt:null}});
 await application.reconcileIpaymuPayment('TEST_ONLY_PAYMENT',deps);
 assert.equal((await db.client`SELECT status FROM order_payments`)[0].status,'refunded');assert.equal((await db.client`SELECT status FROM orders`)[0].status,'paid');assert.equal((await db.client`SELECT count(*)::int n FROM inventory_movements`)[0].n,0);
 provider.getPaymentSession=async()=>({ok:false,error:{code:'unavailable',message:'TEST_ONLY lookup outage',retryable:true}});
 await assert.rejects(()=>application.reconcileIpaymuPayment('TEST_ONLY_PAYMENT',deps),/lookup/i);
}));
test("PG: targeted Finance poll cannot accept another amount or merchant",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db)=>{
 await paid(db);const deps={tx:new persistence.PostgresTransactionManager(db),merchant:'TEST_ONLY_MERCHANT',clock:new FixedClock(new Date().toISOString()),ids:new CryptoIdGenerator(),provider:{getPaymentSession:async()=>({ok:true,value:{provider:'ipaymu',providerSessionId:'TEST_ONLY_SESSION',providerPaymentId:'1001',referenceId:'TEST_ONLY_REF',amount:1,rawStatus:'REFUNDED',redirectUrl:'',expiresAt:null}})}};
 assert.equal((await application.reconcileIpaymuPayment('TEST_ONLY_PAYMENT',deps)).outcome,'exception');
 assert.equal((await db.client`SELECT status FROM order_payments`)[0].status,'succeeded');assert.equal((await db.client`SELECT reconciliation_state FROM order_payments`)[0].reconciliation_state,'provider_mismatch');
 deps.provider.getPaymentSession=async()=>({ok:true,value:{provider:'ipaymu',providerSessionId:'TEST_ONLY_SESSION',providerPaymentId:'1001',referenceId:'TEST_ONLY_REF',providerBusinessId:'TEST_ONLY_FOREIGN_MERCHANT',amount:35000,rawStatus:'REFUNDED',redirectUrl:'',expiresAt:null}});
 assert.equal((await application.reconcileIpaymuPayment('TEST_ONLY_PAYMENT',deps)).outcome,'exception');assert.equal((await db.client`SELECT status FROM order_payments`)[0].status,'succeeded');
}));
test("PG: fulfillment and refund reject mismatched payment amounts",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await paid(db);await db.client`UPDATE order_payments SET amount=1000 WHERE id='TEST_ONLY_PAYMENT'`;
 await assert.rejects(()=>ops.fulfill('packer','mismatch','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY packing'}),/verified|amount|match/i);
 await assert.rejects(()=>ops.create('finance1','mismatch_refund',{kind:'refund_full',payload:{orderId:'TEST_ONLY_ORDER',amount:35000,reason:'TEST_ONLY refund',evidenceRef:'TEST_ONLY_DOC'}}),/reconciled|amount|match/i);
}));
test("PG: known webhook reconciliation permits fulfillment but an ambiguous state does not",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await paid(db);await db.client`UPDATE order_payments SET reconciliation_state='ambiguous' WHERE id='TEST_ONLY_PAYMENT'`;
 await assert.rejects(()=>ops.fulfill('packer','ambiguous','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY packing'}),/verified/i);
 await db.client`UPDATE order_payments SET reconciliation_state='reconciled_by_webhook' WHERE id='TEST_ONLY_PAYMENT'`;
 assert.equal((await ops.fulfill('packer','reconciled','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY packing'})).stage,'packing');
}));
test("PG: production refuses synthetic shipping evidence",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db)=>{
 const ops=new persistence.PostgresOperations(db,{writesEnabled:true,checkoutAdmission:'disabled',environment:'production'});
 await assert.rejects(()=>ops.create('counter','fake_shipping',{kind:'shipping_policy',payload:{scope:'whole_city',policy:'free_promotional',cities:['TEST_ONLY_CITY'],amount:0,serviceCoverage:'TEST_ONLY_SERVICE',costOwner:'TEST_ONLY_OWNER',startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString(),approvalRef:'TEST_ONLY_DOC',verification:{status:'VERIFIED',evidenceRef:'TEST_ONLY_DOC',verifiedBy:'counter',verifiedAt:new Date().toISOString()}}}),/synthetic/i);
}));
test("PG: staff grants require admin and forbid self escalation or last-admin removal",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const input={subject:'reader',role:'finance',action:'grant',approvalRef:'TEST_ONLY_OWNER',reason:'TEST_ONLY approved Finance account'};
 await assert.rejects(()=>ops.staffGrant('counter','not_admin',input),/permission|izin/i);
 await ops.staffGrant('owner','grant_finance',input);assert.ok((await ops.rolesFor('reader')).includes('finance'));
 await assert.rejects(()=>ops.staffGrant('owner','self_grant',{...input,subject:'owner'}),/self/i);
 await assert.rejects(()=>ops.staffGrant('owner','last_admin',{...input,subject:'owner',role:'admin',action:'revoke'}),/last|self/i);
}));
test("PG: concurrent identical draft commands and outbox claims are not duplicated",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const payload=intake();const [a,b]=await Promise.all([ops.create('counter','concurrent',{kind:'inventory_count',payload}),ops.create('counter','concurrent',{kind:'inventory_count',payload})]);assert.equal(a.id,b.id);
 const store=new persistence.PostgresOperationsOutbox(db);
 const [first,second]=await Promise.all([store.claim(20),store.claim(20)]);
 assert.equal(first.length+second.length,1);const event=[...first,...second][0];
 await store.complete({...event,attempt:event.attempt+1});assert.equal((await db.client`SELECT status FROM outbox_events`)[0].status,'pending');
 await store.complete(event);assert.equal((await db.client`SELECT status FROM outbox_events`)[0].status,'published');
}));
test("PG: duplicated physical-count requests keep the original count identity",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 const payload=intake();
 for(const key of ['first','second']){
  const draft=await ops.create('counter',key,{kind:'inventory_count',payload});
  await ops.approve('reviewer',key+'_approve',draft.id,{expectedVersion:1,reason:'TEST_ONLY QC'});
  await ops.apply('counter',key+'_apply',draft.id,{expectedVersion:2,reason:'TEST_ONLY count'});
 }
 assert.equal((await db.client`SELECT count(*)::int n FROM inventory_onboarding_operations`)[0].n,1);
 assert.equal((await db.client`SELECT quantity_on_hand FROM inventory_lots`)[0].quantity_on_hand,1);
}));
test("PG: dedicated admin DB role can operate but cannot update payment status",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db)=>{
 const role='test_ops_role_'+Date.now();const url=new URL(process.env.DATABASE_URL);
 const [{literal}]=await db.client`SELECT quote_literal(${decodeURIComponent(url.password)}) literal`;
 await db.client.unsafe('CREATE ROLE '+role+' LOGIN PASSWORD '+literal);
 let limited;
 try{
  const grants=readFileSync(new URL('../../../scripts/operations/admin-database-grants.sql',import.meta.url),'utf8').replaceAll('yubie_ops',role);
  const connection=await db.client.reserve();
  try{await connection.unsafe(grants);}finally{connection.release();}
  const [{name}]=await db.client`SELECT current_database() name`;url.pathname='/'+name;url.username=role;
  limited=persistence.createDatabase(url.toString());const ops=new persistence.PostgresOperations(limited,{writesEnabled:true,checkoutAdmission:'disabled'});
  const input=intake();await ops.preview('counter',input);
  const draft=await ops.create('counter','limited_create',{kind:'inventory_count',payload:input});
  await ops.approve('reviewer','limited_approve',draft.id,{expectedVersion:1,reason:'TEST_ONLY QC'});
  await ops.apply('counter','limited_apply',draft.id,{expectedVersion:2,reason:'TEST_ONLY verified count'});
  await paid(db);
  await ops.fulfill('packer','limited_pack','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY fulfillment'});
  await assert.rejects(()=>limited.client`UPDATE order_payments SET status='succeeded'`,/permission denied/i);
 }finally{
  if(limited)await persistence.closeDatabase(limited);
  await db.client.unsafe('DROP OWNED BY '+role);await db.client`DROP ROLE ${db.client(role)}`;
 }
}));
test("PG: fulfillment preserves privacy and enforces paid packing tracking and holds",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await paid(db);
 assert.equal((await ops.orderDetail('reader','TEST_ONLY_ORDER')).delivery,null);
 assert.equal((await ops.orderDetail('packer','TEST_ONLY_ORDER')).delivery.customer_name,'TEST_ONLY_CUSTOMER');
 await assert.rejects(()=>ops.fulfill('reader','wrong_role','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY'}),/permission|izin/i);
 await ops.fulfill('packer','packing','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY packing'});
 await ops.fulfill('packer','packed','TEST_ONLY_ORDER',{expectedVersion:1,stage:'packed',reason:'TEST_ONLY packed'});
 await assert.rejects(()=>ops.fulfill('packer','missing_tracking','TEST_ONLY_ORDER',{expectedVersion:2,stage:'shipped',reason:'TEST_ONLY shipment'}),/tracking|carrier/i);
 await db.client`UPDATE orders SET fulfillment_hold='TEST_ONLY_RECALL' WHERE id='TEST_ONLY_ORDER'`;
 await assert.rejects(()=>ops.fulfill('packer','held_shipment','TEST_ONLY_ORDER',{expectedVersion:2,stage:'shipped',carrier:'TEST_ONLY_CARRIER',trackingNumber:'TEST_ONLY_TRACKING',reason:'TEST_ONLY shipment'}),/hold/i);
 await db.client`UPDATE orders SET fulfillment_hold=NULL WHERE id='TEST_ONLY_ORDER'`;
 await ops.fulfill('packer','shipped','TEST_ONLY_ORDER',{expectedVersion:2,stage:'shipped',carrier:'TEST_ONLY_CARRIER',trackingNumber:'TEST_ONLY_TRACKING',reason:'TEST_ONLY shipment'});
 assert.equal((await db.client`SELECT status FROM orders WHERE id='TEST_ONLY_ORDER'`)[0].status,'shipped');
}));
test("PG: a recall committed during fulfillment blocks dispatch",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await paid(db);
 await db.client`INSERT INTO inventory_lots(id,product_id,size_id,lot_code,quantity_on_hand,expiry_date,status,created_at,updated_at) VALUES('TEST_ONLY_RECALL_LOT','shake','sachet','TEST_ONLY_RECALL',0,'2100-01-01','depleted',now(),now())`;
 await db.client`INSERT INTO inventory_reservations(id,order_id,lot_id,product_id,size_id,quantity,status,expires_at,created_at,updated_at) VALUES('TEST_ONLY_RECALL_RES','TEST_ONLY_ORDER','TEST_ONLY_RECALL_LOT','shake','sachet',1,'consumed',now(),now(),now())`;
 const started=Promise.withResolvers(),release=Promise.withResolvers();
 const recall=db.client.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtextextended('inventory-onboarding',0))`;
  await tx`UPDATE inventory_lots SET status='recalled' WHERE id='TEST_ONLY_RECALL_LOT'`;started.resolve();await release.promise;
  await tx`UPDATE orders SET fulfillment_hold='lot_recalled' WHERE id='TEST_ONLY_ORDER' AND status NOT IN ('shipped','completed','cancelled')`;
 });
 await started.promise;
 let finished=false;const packing=ops.fulfill('packer','race_pack','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY packing'}).then(value=>{finished=true;return{value};},error=>{finished=true;return{error};});
 try{
  for(let i=0;i<100&&!finished;i++){
   const [{waiting}]=await db.client`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%inventory-onboarding%') waiting`;
   if(waiting)break;await new Promise(r=>setTimeout(r,10));
  }
 }finally{release.resolve();await recall;}
 const result=await packing;assert.match(result.error?.message??'Unexpected successful fulfillment',/hold/i);
}));
test("PG: manual full refund never claims a provider refund or restocks without evidence",{skip:!process.env.DATABASE_URL},async()=>isolated(async(db,ops)=>{
 await paid(db);
 await assert.rejects(()=>ops.create('finance1','partial',{kind:'refund_full',payload:{orderId:'TEST_ONLY_ORDER',amount:1000,reason:'TEST_ONLY partial',evidenceRef:'TEST_ONLY_REFUND_DOC'}}),/full|penuh/i);
 const draft=await ops.create('finance1','refund_create',{kind:'refund_full',payload:{orderId:'TEST_ONLY_ORDER',amount:35000,reason:'TEST_ONLY full refund',evidenceRef:'TEST_ONLY_REFUND_DOC'}});
 await ops.approve('finance2','refund_approve',draft.id,{expectedVersion:1,reason:'TEST_ONLY Finance review'});
 await ops.apply('finance1','refund_handoff',draft.id,{expectedVersion:2,reason:'TEST_ONLY merchant handoff'});
 await assert.rejects(()=>ops.fulfill('packer','refund_pending_pack','TEST_ONLY_ORDER',{expectedVersion:0,stage:'packing',reason:'TEST_ONLY packing'}),/hold|refund/i);
 const record=await ops.recordRefund('finance1','record_execution',draft.id,{expectedVersion:3,merchantReference:'TEST_ONLY_MERCHANT',evidenceRef:'TEST_ONLY_RECEIPT',reason:'TEST_ONLY manual execution'});
 assert.equal(record.paymentStatusChanged,false);
 assert.equal((await db.client`SELECT status FROM order_payments WHERE id='TEST_ONLY_PAYMENT'`)[0].status,'succeeded');
 await assert.rejects(()=>ops.confirmRefund('finance2','unverified',draft.id,{expectedVersion:4,reason:'TEST_ONLY confirmation'}),/provider|authoritative/i);
 // Synthetic authoritative-provider fixture; no real refund or provider request.
 await db.client`UPDATE order_payments SET status='refunded' WHERE id='TEST_ONLY_PAYMENT'`;
 assert.equal((await ops.confirmRefund('finance2','confirmed',draft.id,{expectedVersion:4,reason:'TEST_ONLY reconciled confirmation'})).stockRestocked,false);
 assert.equal((await db.client`SELECT status FROM orders WHERE id='TEST_ONLY_ORDER'`)[0].status,'paid');
 assert.equal((await db.client`SELECT count(*)::int n FROM inventory_movements`)[0].n,0);
}));
