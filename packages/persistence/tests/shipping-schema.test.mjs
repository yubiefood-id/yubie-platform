import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {readFileSync,readdirSync} from 'node:fs';
import * as persistence from '../dist/index.js';

async function ephemeralDatabase() {
  const admin = postgres(process.env.DATABASE_URL, {max: 1});
  const name = "shipping_" + Date.now();
  await admin`CREATE DATABASE ${admin(name)}`;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/" + name;
  const db = persistence.createDatabase(url.toString());
  try {
    for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) {
      await db.client.unsafe(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
    }
  } catch (error) {
    await persistence.closeDatabase(db);
    await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;
    await admin.end();
    throw error;
  }
  return {db, cleanup: async () => { await persistence.closeDatabase(db); await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`; await admin.end(); }};
}

async function seedOrder(db, id) {
  await db.client`INSERT INTO orders (id, checkout_ref, checkout_public_token, status, customer_email, total_amount, subtotal_amount, grand_total_amount, created_at, updated_at)
    VALUES (${id}, ${"ref_" + id}, ${"tok_" + id}, 'paid', 'ops@example.invalid', 50000, 50000, 50000, now(), now())`;
}

test('migration 0027 creates the shipping execution schema',{skip:!process.env.DATABASE_URL},async()=>{
  const {db,cleanup} = await ephemeralDatabase();
  try{
    const expected = [
      'shipment_dispatch_intents','shipment_finance_events','shipment_items','shipment_provider_inbox','shipments','shipping_origins','shipping_quotes','sku_shipping_profiles'
    ];
    const tables = (await db.client`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ${db.client(expected)} ORDER BY table_name`).map(r=>r.table_name);
    assert.deepEqual(tables, expected);
  } finally { await cleanup(); }
});

test('shipments enforce one live booking identity per package and generation',{skip:!process.env.DATABASE_URL},async()=>{
  const {db,cleanup} = await ephemeralDatabase();
  try{
    await seedOrder(db,'ord_1');
    const insert = (id, referenceId, generation, overrides = {}) =>
      db.client`INSERT INTO shipments (id,order_id,package_index,dispatch_generation,reference_id,status,version,created_at,updated_at,provider_order_id)
        VALUES (${id},'ord_1',0,${generation},${referenceId},${overrides.status ?? 'not_ready'},1,now(),now(),${overrides.providerOrderId ?? null})`;
    await insert('shp_1','ybshp-ref-1',1);
    await assert.rejects(()=>insert('shp_2','ybshp-ref-1',1), /reference_id/);
    // One shipment row per physical package, even across retry generations.
    await assert.rejects(()=>insert('shp_3','ybshp-ref-2',2), /order_package/);
    await db.client`UPDATE shipments SET provider_order_id='bs_1' WHERE id='shp_1'`;
    await assert.rejects(()=>insert('shp_4','ybshp-ref-3',3,{providerOrderId:'bs_1'}), /provider_order_id/);
    await assert.rejects(()=>insert('shp_5','ybshp-ref-4',4,{status:'teleported'}), /status/);
  } finally { await cleanup(); }
});

test('shipment finance events are append-only',{skip:!process.env.DATABASE_URL},async()=>{
  const {db,cleanup} = await ephemeralDatabase();
  try{
    await seedOrder(db,'ord_f');
    await db.client`INSERT INTO shipment_finance_events (id,order_id,kind,amount_idr,created_at) VALUES ('fin_1','ord_f','provider_booked',18000,now())`;
    await assert.rejects(()=>db.client`UPDATE shipment_finance_events SET amount_idr=1 WHERE id='fin_1'`, /append-only/);
    await assert.rejects(()=>db.client`DELETE FROM shipment_finance_events WHERE id='fin_1'`, /append-only/);
  } finally { await cleanup(); }
});

test('shipment provider inbox dedupes by key and queues retries',{skip:!process.env.DATABASE_URL},async()=>{
  const {db,cleanup} = await ephemeralDatabase();
  try{
    const row = {id:'inbox_1',dedupe_key:'biteship:order_1:status:picked',event:'order.status',provider_order_id:'order_1',status:'picked',payload:JSON.stringify({event:'order.status',order_id:'order_1',status:'picked'}),payload_hash:'a'.repeat(64)};
    await db.client`INSERT INTO shipment_provider_inbox ${db.client(row)}`;
    await assert.rejects(()=>db.client`INSERT INTO shipment_provider_inbox ${db.client({...row,id:'inbox_2'})}`, /dedupe_key/);
    await assert.rejects(()=>db.client`INSERT INTO shipment_provider_inbox ${db.client({...row,id:'inbox_3',dedupe_key:'biteship:other',event:'order.exploded'})}`, /event/);
    const due = await db.client`SELECT id FROM shipment_provider_inbox WHERE processed_at IS NULL AND retry_after<=now()`;
    assert.equal(due.length,1);
  } finally { await cleanup(); }
});

test('shipping quotes bind to an active origin and expire by status',{skip:!process.env.DATABASE_URL},async()=>{
  const {db,cleanup} = await ephemeralDatabase();
  try{
    await db.client`INSERT INTO shipping_origins (id,label,contact_name,contact_phone,address,is_active,version,created_at,updated_at)
      VALUES ('origin_1','Gudang Utama','Owner','081200000000','Jl. Contoh No. 1',true,1,now(),now())`;
    await seedOrder(db,'ord_q');
    const c = 'c'.repeat(64), d = 'd'.repeat(64), p = 'p'.repeat(64);
    await db.client`INSERT INTO shipping_quotes (id,principal_key,cart_hash,destination_hash,origin_id,parcels_digest,courier_company,courier_service_code,delivery_type,offered_amount_idr,provider_amount_idr,subsidy_amount_idr,tax_amount_idr,tax_policy_version,status,valid_until,created_at)
      VALUES ('q_1','guest:x',${c},${d},'origin_1',${p},'jne','jne_reg','now',22000,22000,0,0,'non-pkp-v1','quoted',now()+interval '15 minutes',now())`;
    // A quote cannot be marked consumed without a timestamp (CHECK).
    await assert.rejects(()=>db.client`UPDATE shipping_quotes SET status='consumed', order_id='ord_q' WHERE id='q_1'`, /consumed_at/);
    await db.client`UPDATE shipping_quotes SET status='consumed', order_id='ord_q', consumed_at=now() WHERE id='q_1'`;
    // Instant delivery needs no schedule, but invalid delivery types are rejected.
    await assert.rejects(()=>db.client`INSERT INTO shipping_quotes (id,principal_key,cart_hash,destination_hash,origin_id,parcels_digest,courier_company,courier_service_code,delivery_type,offered_amount_idr,provider_amount_idr,subsidy_amount_idr,tax_amount_idr,tax_policy_version,status,valid_until,created_at)
      VALUES ('q_2','guest:x',${c},${d},'origin_1',${p},'gojek','gojek_instant','teleport',22000,22000,0,0,'non-pkp-v1','quoted',now()+interval '15 minutes',now())`, /delivery_type/);
    await assert.rejects(()=>db.client`INSERT INTO shipping_quotes (id,principal_key,cart_hash,destination_hash,origin_id,parcels_digest,courier_company,courier_service_code,delivery_type,offered_amount_idr,provider_amount_idr,subsidy_amount_idr,tax_amount_idr,tax_policy_version,status,valid_until,created_at)
      VALUES ('q_3','guest:x',${c},${d},'nowhere',${p},'jne','jne_reg','now',22000,22000,0,0,'non-pkp-v1','quoted',now()+interval '15 minutes',now())`, /origin_id/);
  } finally { await cleanup(); }
});
