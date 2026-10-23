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
