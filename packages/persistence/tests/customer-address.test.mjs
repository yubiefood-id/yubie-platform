import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import * as p from '../dist/index.js';
import * as a from '@yubie/application';
let db,admin,name,now,deps;
const enabled=!!process.env.DATABASE_URL;
before(async()=>{
 if(!enabled)return;
 admin=p.createDatabase(process.env.DATABASE_URL);name='address_v3_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);
 const u=new URL(process.env.DATABASE_URL);u.pathname='/'+name;db=p.createDatabase(u.toString());
 const dir=new URL('../migrations/',import.meta.url);
 for(const f of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
  if(f.startsWith('0018_')){
   const time='2026-10-23T12:00:00.000Z';
   await db.client`INSERT INTO users(id,google_sub,created_at,updated_at) VALUES('legacy_0018','synthetic_google_0018',${time},${time})`;
   await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES('legacy_session_0018','legacy_0018','synthetic_session_0018',${time},'2026-11-22T12:00:00.000Z')`;
   await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,user_id,customer_email,delivery_jsonb,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('legacy_order_0018','legacy_ref_0018','synthetic_token_0018','legacy_0018','synthetic@example.invalid','{"address":"Alamat historis sintetis","city":"Bandung"}'::jsonb,10000,10000,10000,${time},${time})`;
  }
  await db.client.begin(async s=>s.unsafe(await readFile(new URL(f,dir),'utf8')));
 }
 now=Date.now();
});
after(async()=>{if(db)await p.closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await p.closeDatabase(admin);}});

const input={label:'Rumah',recipientName:'Synthetic',recipientPhone:'081234567890',fullAddress:'Alamat sintetis untuk pengujian',province:'Jawa Barat',city:'Bandung',district:'Coblong',subdistrict:'Dago',postalCode:'40135',building:'',rt:'',rw:'',notes:'',countryCode:'ID'};
async function setup(){
 const clock={now:()=>new Date(now).toISOString()},tokens=new a.CryptoSessionTokenService();
 const actors=[];
 for(const n of ['one','two']){
  const time=clock.now(),id='address_user_'+n+'_'+randomUUID(),issued=tokens.issue();
  await db.client`INSERT INTO users(id,created_at,updated_at) VALUES(${id},${time},${time})`;
  await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES(${id},${id},${issued.tokenHash},${time},${new Date(now+90*86400_000).toISOString()})`;
  actors.push({userId:id,authenticatedAt:time,sessionHash:issued.tokenHash});
 }
 return{deps:{tx:new p.PostgresTransactionManager(db),clock,ids:{nextId:()=>randomUUID()},verifyPin:async()=>true},actors};
}
test('saved addresses are owner-scoped, bounded and have one atomic default',{skip:!enabled},async()=>{
 const {deps,actors:[owner,other]}=await setup();
 const first=await a.saveCustomerAddress({actor:owner,address:input},deps);assert.equal(first.ok,true);assert.equal(first.value.isDefault,true);
 const second=await a.saveCustomerAddress({actor:owner,address:{...input,label:'Kantor'}},deps);assert.equal(second.ok,true);
 assert.equal((await a.listCustomerAddresses({actor:other},deps)).value.length,0);
 assert.equal((await a.saveCustomerAddress({actor:other,id:first.value.id,address:input},deps)).ok,false);
 assert.equal((await a.deleteCustomerAddress({actor:other,id:first.value.id},deps)).ok,false);
 assert.equal((await a.setDefaultCustomerAddress({actor:other,id:first.value.id},deps)).ok,false);
 await Promise.all([first.value.id,second.value.id].map(id=>a.setDefaultCustomerAddress({actor:owner,id},deps)));
 const rows=(await a.listCustomerAddresses({actor:owner},deps)).value;assert.equal(rows.filter(x=>x.isDefault).length,1);
 const chosen=rows.find(x=>x.isDefault);assert.equal((await a.deleteCustomerAddress({actor:owner,id:chosen.id},deps)).ok,true);
 assert.equal((await a.listCustomerAddresses({actor:owner},deps)).value.filter(x=>x.isDefault).length,1);
 await db.client`UPDATE auth_sessions SET revoked_at=${deps.clock.now()} WHERE token_hash=${owner.sessionHash}`;
 assert.equal((await a.listCustomerAddresses({actor:owner},deps)).ok,false);
});

test('expired pin is hidden on reads and edits and removed without changing customer-authored address',{skip:!enabled},async()=>{
 const {deps,actors:[owner]}=await setup();
 const created=await a.saveCustomerAddress({actor:owner,address:{...input,pin:{latitude:-6.9,longitude:107.6,source:'google',confirmed:true}}},deps);assert.equal(created.ok,true);
 const expiry=created.value.pin.expiresAt;now+=86400_000;
 const edit=await a.saveCustomerAddress({actor:owner,id:created.value.id,address:{label:'Kantor'}},deps);assert.equal(edit.value.pin.expiresAt,expiry);
 const repeated=await a.saveCustomerAddress({actor:owner,id:created.value.id,address:{...input,pin:{latitude:-6.9,longitude:107.6,source:'google',confirmed:true}}},deps);assert.equal(repeated.value.pin.expiresAt,expiry);
 now+=30*86400_000;
 const listed=(await a.listCustomerAddresses({actor:owner},deps)).value;assert.equal(listed[0].pin,null);
 const after=await a.saveCustomerAddress({actor:owner,id:created.value.id,address:{label:'Rumah'}},deps);assert.equal(after.value.pin,null);
 await a.purgeAddressPins(deps);const [row]=await db.client`SELECT address,pin,pin_expires_at FROM customer_addresses WHERE id=${created.value.id}`;assert.equal(row.pin,null);assert.equal(row.pin_expires_at,null);assert.equal(row.address.fullAddress,input.fullAddress);
});

test('Maps request budget commits before remote work without storing search or coordinates',{skip:!enabled},async()=>{
 let active=0,calls=0;const tx=new p.PostgresTransactionManager(db);const wrapped={async run(operation,fn){active++;try{return await tx.run(operation,fn);}finally{active--;}}};
 const deps={tx:wrapped,clock:{now:()=>new Date(now).toISOString()},hash:value=>new a.CryptoSessionTokenService().hash(value),provider:{async autocomplete(){assert.equal(active,0);calls++;return[];},async details(){return null;},async reverse(){return null;}}};
 for(let i=0;i<21;i++)await a.lookupDeliveryLocation({action:'autocomplete',query:'Synthetic location query',sessionToken:randomUUID(),browser:'synthetic-location-browser',ip:'synthetic-location-ip'},deps);
 assert.equal(calls,20);
 const [row]=await db.client`SELECT count(*)::int AS n FROM identity_rate_buckets WHERE key LIKE '%Synthetic location query%'`;assert.equal(row.n,0);
});

test('saved address edits and deletion do not alter an existing order address or money snapshot',{skip:!enabled},async()=>{
 const {deps,actors:[owner]}=await setup();const time=deps.clock.now(),id='snapshot_'+randomUUID();
 const snapshot={name:'Synthetic',phone:'+12025550100',address:'Alamat historis sintetis',city:'Bandung'};
 await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,user_id,customer_email,delivery_jsonb,subtotal_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES(${id},${id},${id},${owner.userId},'synthetic@example.invalid',${JSON.stringify(snapshot)}::jsonb,10000,10000,10000,${time},${time})`;
 const saved=await a.saveCustomerAddress({actor:owner,address:input},deps);assert.equal(saved.ok,true);
 await a.saveCustomerAddress({actor:owner,id:saved.value.id,address:{fullAddress:'Alamat baru sintetis untuk pengujian'}},deps);
 await a.deleteCustomerAddress({actor:owner,id:saved.value.id},deps);
 const [row]=await db.client`SELECT delivery_jsonb,grand_total_amount,total_amount FROM orders WHERE id=${id}`;
 assert.deepEqual(row.delivery_jsonb,snapshot);assert.equal(row.grand_total_amount,10000);assert.equal(row.total_amount,10000);
});

test('0018 upgrades populated identity/order storage without changing historical records',{skip:!enabled},async()=>{
 const [user]=await db.client`SELECT google_sub FROM users WHERE id='legacy_0018'`;assert.equal(user.google_sub,'synthetic_google_0018');
 const [session]=await db.client`SELECT token_hash,revoked_at FROM auth_sessions WHERE id='legacy_session_0018'`;assert.equal(session.token_hash,'synthetic_session_0018');assert.equal(session.revoked_at,null);
 const [order]=await db.client`SELECT delivery_jsonb,grand_total_amount FROM orders WHERE id='legacy_order_0018'`;assert.deepEqual(order.delivery_jsonb,{address:'Alamat historis sintetis',city:'Bandung'});assert.equal(order.grand_total_amount,10000);
});
