import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {readFileSync,readdirSync} from 'node:fs';
import * as persistence from '@yubie/persistence';
import { runShipmentDispatch } from '../dist/shipment-dispatch-handler.js';

const ENV_NAMES = ["SHIPPING_EXECUTION_MODE","SHIPPING_PROVIDER","BITESHIP_API_KEY","BITESHIP_ENV","BITESHIP_WEBHOOK_SECRET","BITESHIP_WEBHOOK_SECRET_HEADER","SHIPPING_PILOT_MAX_BOOKINGS","SHIPPING_PILOT_BUDGET_IDR","SHIPPING_FREE_SUBSIDY_MAX_IDR","YUBIE_ENV","COMMERCE_PROVIDER","YUBIE_LAUNCH_PROFILE","DATABASE_URL","API_PROXY_TOKEN","APP_ORIGIN"];

function countingFetch(calls) {
  return async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    if (url.endsWith("/v1/orders") && init?.method === "POST") {
      calls.posts.push(body);
      return { ok: true, status: 200, json: async () => ({ success: true, object: "order", id: `bs_${calls.posts.length}`, reference_id: body?.reference_id, price: 20000, currency: "IDR", status: "confirmed", courier: { tracking_id: "T1", waybill_id: `WYB-${calls.posts.length}`, company: "JNE", type: "reg" } }) };
    }
    if (url.includes("/v1/orders/")) return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_x", status: "confirmed", price: 20000, currency: "IDR", courier: { waybill_id: "WYB-X", company: "JNE", type: "reg" } }) };
    return { ok: true, status: 200, json: async () => ({ success: true, pricing: [] }) };
  };
}

async function ephemeral() {
  const admin = postgres(process.env.DATABASE_URL, { max: 1 });
  const name = "q73_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  await admin`CREATE DATABASE ${admin(name)}`;
  const url = new URL(process.env.DATABASE_URL); url.pathname = "/" + name;
  const db = persistence.createDatabase(url.toString());
  for (const f of readdirSync(new URL('../../../packages/persistence/migrations/', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) {
    await db.client.unsafe(readFileSync(new URL('../../../packages/persistence/migrations/' + f, import.meta.url), 'utf8'));
  }
  return { db, cleanup: async () => { await persistence.closeDatabase(db); await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`; await admin.end(); } };
}

const NOW = () => new Date().toISOString();

/** Minimal bare order row for pre-seeded committed bookings (FK target only). */
async function seedBareOrder(db, orderId) {
  await db.client`INSERT INTO orders (id,checkout_ref,checkout_public_token,status,customer_email,total_amount,subtotal_amount,shipping_amount,discount_amount,grand_total_amount,created_at,updated_at)
    VALUES (${orderId},${"ref_" + orderId},${"tok_" + orderId},'completed','ops@example.invalid',20000,0,20000,0,20000,now(),now())`;
}

async function seedBase(db) {
  await db.client`INSERT INTO shipping_origins (id,label,contact_name,contact_phone,address,postal_code,is_active,version,created_at,updated_at)
    VALUES ('origin_1','Gudang Utama','Owner','+6281200000001','Jl. Gudang Utama 1','45363',true,1,now(),now())`;
  await db.client`INSERT INTO sku_shipping_profiles (id,sku,weight_grams,length_cm,width_cm,height_cm,storage_class,effective_from,version,created_at)
    VALUES ('prof_flour','YBF-250',260,10,6,4,'shelf_stable',now(),1,now())`;

  await db.client`INSERT INTO ops_staff_grants (subject,role,granted_by,approval_ref,granted_at) VALUES ('packer','fulfillment','TEST_ONLY_BOOTSTRAP','TEST_ONLY_APPROVAL',now())`;
}

const LINES = [{ id: "flour-250g", productId: "flour", productName: "Tepung Yubie", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 35000 }];

async function seedOrder(db, orderId, { shipping = { policy: "courier", amount: 20000, quoteId: null }, lines = LINES, quotePrice = 20000, paymentStatus = "succeeded" } = {}) {
  const now = NOW();
  const quoteId = shipping.quoteId ?? `sq_${orderId}`;
  await db.client`INSERT INTO shipping_quotes (id,principal_key,cart_hash,destination_hash,origin_id,parcels_digest,courier_company,courier_service_code,courier_service_name,delivery_type,offered_amount_idr,provider_amount_idr,subsidy_amount_idr,tax_amount_idr,tax_policy_version,status,valid_until,created_at)
    VALUES (${quoteId},'guest:' || repeat('a',64),repeat('c',64),repeat('d',64),'origin_1',repeat('p',64),'JNE','jne_reg','Reguler','scheduled',${shipping.policy === "free_promotional" ? 0 : quotePrice},${quotePrice},${shipping.policy === "free_promotional" ? quotePrice : 0},0,${shipping.policy === "free_promotional" ? "free-subsidy-v1" : "non-pkp-v1"},'quoted',now()+interval '1 hour',now())`;
  const shippingAmount = shipping.amount;
  await db.client`INSERT INTO orders (id,checkout_ref,checkout_public_token,status,customer_name,customer_phone,delivery_jsonb,shipping_jsonb,lines_jsonb,currency,subtotal_amount,shipping_amount,discount_amount,grand_total_amount,total_amount,created_at,updated_at)
    VALUES (${orderId},${"ref_" + orderId},${"tok_" + orderId},'paid','Pelanggan','+6281300000002',
    ${JSON.stringify({ name: "Pelanggan", phone: "+6281300000002", address: "Jl. Rumah 2", city: "Bandung", postalCode: "40115" })}::jsonb,
    ${JSON.stringify({ ...shipping, quoteId, providerAmountIdr: quotePrice, subsidyAmountIdr: shipping.policy === "free_promotional" ? quotePrice : 0, taxAmountIdr: 0, taxPolicyVersion: shipping.policy === "free_promotional" ? "free-subsidy-v1" : "non-pkp-v1" })}::jsonb,
    ${JSON.stringify(lines)}::jsonb,'IDR',${lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)},${shippingAmount},0,${lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) + shippingAmount},${lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) + shippingAmount},${now},${now})`;
  await db.client`INSERT INTO order_payments (id,order_id,provider,provider_session_id,provider_payment_id,currency,status,amount,created_at,updated_at)
    VALUES (${"pay_" + orderId},${orderId},'ipaymu',${"sess_" + orderId},'9001','IDR',${paymentStatus},${lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) + shippingAmount},now(),now())`;
  // Real TX1 consumes the quote; mirror that state so dispatch guards pass.
  await db.client`UPDATE shipping_quotes SET status='consumed', consumed_at=now(), order_id=${orderId} WHERE id=${quoteId}`;
}

async function pack(db, orderId) {
  const ops = new persistence.PostgresOperations(db, { writesEnabled: true, checkoutAdmission: "enabled", environment: "test" });
  await ops.fulfill("packer", `k1_${orderId}`, orderId, { expectedVersion: 0, stage: "packing", reason: "TEST_ONLY packing" });
  await ops.fulfill("packer", `k2_${orderId}`, orderId, { expectedVersion: 1, stage: "packed", reason: "TEST_ONLY packed" });
  return ops;
}

function setEnv(overrides = {}) {
  const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  const base = {
    YUBIE_ENV: "test", COMMERCE_PROVIDER: "preview", YUBIE_LAUNCH_PROFILE: "DIRECT_COMMERCE_SANDBOX",
    SHIPPING_EXECUTION_MODE: "sandbox", SHIPPING_PROVIDER: "biteship", BITESHIP_API_KEY: "test_key_only", BITESHIP_ENV: "sandbox",
  };
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, base, overrides);
  return () => { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };
}

test("P0-A pilot count is a hard maximum: 4 of 5 used with 5 ready -> exactly one booking", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv({ SHIPPING_EXECUTION_MODE: "pilot", SHIPPING_PILOT_MAX_BOOKINGS: "5", SHIPPING_PILOT_BUDGET_IDR: "1000000" });
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    // 4 committed bookings already consume the pilot count.
    for (let i = 1; i <= 4; i += 1) {
      await seedBareOrder(db, "o_c" + i);
      await db.client`INSERT INTO shipments (id,order_id,package_index,dispatch_generation,reference_id,provider_order_id,status,quoted_amount_idr,actual_amount_idr,version,created_at,updated_at)
        VALUES (${"shp_c" + i},${"o_c" + i},0,1,${"ybshp-c" + i},${"bs_c" + i},'booked',20000,20000,1,now(),now())`;
    }
    const calls = { posts: [] };
    globalThis.fetch = countingFetch(calls);
    // 5 fresh ready shipments compete for the single remaining slot.
    for (let i = 1; i <= 5; i += 1) {
      const orderId = `ord_a_${i}`;
      await seedOrder(db, orderId);
      await new persistence.PostgresShipmentRepository(db).ensureForPaidOrder({ orderId, checkoutRef: "ref_" + orderId, shipping: { policy: "courier", amount: 20000, quoteId: `sq_${orderId}` }, currency: "IDR" }, NOW());
      await pack(db, orderId);
    }
    await runShipmentDispatch(db, "t");
    assert.equal(calls.posts.length, 1, "exactly one additional booking admitted");
    assert.equal((await db.client`SELECT COUNT(*)::int AS n FROM shipments WHERE provider_order_id IS NOT NULL`)[0].n, 5);
    assert.equal((await db.client`SELECT COUNT(*)::int AS n FROM shipment_dispatch_intents WHERE state='pending'`)[0].n, 4, "others remain pending, not failed");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-A budget admission counts each new booking's estimated cost", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv({ SHIPPING_EXECUTION_MODE: "pilot", SHIPPING_PILOT_MAX_BOOKINGS: "10", SHIPPING_PILOT_BUDGET_IDR: "50000" });
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    // Committed cost 40000; next booking quoted 20000 would exceed 50000.
    await seedBareOrder(db, "o_b1");
    await db.client`INSERT INTO shipments (id,order_id,package_index,dispatch_generation,reference_id,provider_order_id,status,quoted_amount_idr,actual_amount_idr,version,created_at,updated_at)
      VALUES ('shp_b1','o_b1',0,1,'ybshp-b1','bs_b1','booked',40000,40000,1,now(),now())`;
    const calls = { posts: [] };
    globalThis.fetch = countingFetch(calls);
    await seedOrder(db, "ord_budget");
    await new persistence.PostgresShipmentRepository(db).ensureForPaidOrder({ orderId: "ord_budget", checkoutRef: "ref_ord_budget", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_budget" }, currency: "IDR" }, NOW());
    await pack(db, "ord_budget");
    await runShipmentDispatch(db, "t");
    assert.equal(calls.posts.length, 0, "no provider request when remaining budget < estimated cost");
    assert.equal((await db.client`SELECT status FROM shipments WHERE order_id='ord_budget'`)[0].status, "ready", "shipment untouched, retried later");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-A concurrent workers never exceed the hard maximum", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv({ SHIPPING_EXECUTION_MODE: "pilot", SHIPPING_PILOT_MAX_BOOKINGS: "3", SHIPPING_PILOT_BUDGET_IDR: "1000000" });
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    const calls = { posts: [] };
    globalThis.fetch = countingFetch(calls);
    for (let i = 1; i <= 6; i += 1) {
      const orderId = `ord_c_${i}`;
      await seedOrder(db, orderId);
      await new persistence.PostgresShipmentRepository(db).ensureForPaidOrder({ orderId, checkoutRef: "ref_" + orderId, shipping: { policy: "courier", amount: 20000, quoteId: `sq_${orderId}` }, currency: "IDR" }, NOW());
      await pack(db, orderId);
    }
    // Two dispatch runs racing through the same pool.
    await Promise.all([runShipmentDispatch(db, "w1"), runShipmentDispatch(db, "w2")]);
    const booked = (await db.client`SELECT COUNT(*)::int AS n FROM shipments WHERE provider_order_id IS NOT NULL`)[0].n;
    assert.ok(booked <= 3, `committed bookings ${booked} must never exceed 3`);
    assert.equal(calls.posts.length, booked, "every provider POST produced exactly one committed booking");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-A ambiguous outcome holds quota until reconciled", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv({ SHIPPING_EXECUTION_MODE: "pilot", SHIPPING_PILOT_MAX_BOOKINGS: "1", SHIPPING_PILOT_BUDGET_IDR: "1000000" });
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    let timedOut = false;
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/v1/orders") && init?.method === "POST") {
        if (!timedOut) { timedOut = true; const error = new Error("aborted"); error.name = "TimeoutError"; throw error; }
        return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_second", price: 20000, currency: "IDR", status: "confirmed", courier: { waybill_id: "WYB-S", company: "JNE" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };
    await seedOrder(db, "ord_u1");
    await new persistence.PostgresShipmentRepository(db).ensureForPaidOrder({ orderId: "ord_u1", checkoutRef: "ref_ord_u1", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_u1" }, currency: "IDR" }, NOW());
    await pack(db, "ord_u1");
    await runShipmentDispatch(db, "t1"); // -> booking_unknown (may exist at provider)
    assert.equal((await db.client`SELECT status FROM shipments`)[0].status, "booking_unknown");
    // A second ready order must NOT be admitted: the ambiguous first booking
    // still reserves the single pilot slot.
    await seedOrder(db, "ord_u2");
    await new persistence.PostgresShipmentRepository(db).ensureForPaidOrder({ orderId: "ord_u2", checkoutRef: "ref_ord_u2", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_u2" }, currency: "IDR" }, NOW());
    await pack(db, "ord_u2");
    await runShipmentDispatch(db, "t2");
    assert.equal((await db.client`SELECT status FROM shipments WHERE order_id='ord_u2'`)[0].status, "ready", "ambiguous booking keeps reserving the quota");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-A price adjustment raises committed cost and blocks further budget use (GREATEST)", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv({ SHIPPING_EXECUTION_MODE: "pilot", SHIPPING_PILOT_MAX_BOOKINGS: "10", SHIPPING_PILOT_BUDGET_IDR: "50000" });
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    const repo = new persistence.PostgresShipmentRepository(db);
    // Quoted 20000 -> booked -> provider repriced to 45000 (actual > quoted).
    await seedBareOrder(db, "o_p1");
    await db.client`INSERT INTO shipments (id,order_id,package_index,dispatch_generation,reference_id,provider_order_id,status,quoted_amount_idr,version,created_at,updated_at)
      VALUES ('shp_p1','o_p1',0,1,'ybshp-p1','bs_p1','booked',20000,1,now(),now())`;
    await repo.recordPriceChange({ providerOrderId: "bs_p1", priceIdr: 45000, shippingFeeIdr: null, occurredAt: NOW() }, NOW());
    const calls = { posts: [] };
    globalThis.fetch = countingFetch(calls);
    await seedOrder(db, "ord_p2");
    await repo.ensureForPaidOrder({ orderId: "ord_p2", checkoutRef: "ref_ord_p2", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_p2" }, currency: "IDR" }, NOW());
    await pack(db, "ord_p2");
    await runShipmentDispatch(db, "t");
    assert.equal(calls.posts.length, 0, "repriced cost consumes the budget despite the lower original quote");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-B a missing SKU profile blocks dispatch instead of partially booking", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv();
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    // Two-SKU order: shake has NO profile (seedBase only registers flour).
    const twoLines = [...LINES, { id: "shake-1", productId: "shake", productName: "Shake Yubie", sizeId: "sachet", sizeLabel: "1 sachet", quantity: 1, unitPrice: 19500 }];
    await seedOrder(db, "ord_partial", { lines: twoLines });
    await new persistence.PostgresShipmentRepository(db).ensureForPaidOrder({ orderId: "ord_partial", checkoutRef: "ref_ord_partial", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_partial" }, currency: "IDR" }, NOW());
    await pack(db, "ord_partial");
    let posts = 0;
    globalThis.fetch = async (url, init) => { if (url.endsWith("/v1/orders") && init?.method === "POST") { posts += 1; } return { ok: true, status: 200, json: async () => ({ success: true }) }; };
    await runShipmentDispatch(db, "t");
    assert.equal(posts, 0, "Biteship must never receive a partial item list");
    const shipment = (await db.client`SELECT status, blocked_reason FROM shipments WHERE order_id='ord_partial'`)[0];
    assert.equal(shipment.status, "held");
    assert.equal(shipment.blocked_reason, "SKU_PROFILE_MISSING");
    assert.ok((await db.client`SELECT COUNT(*)::int AS n FROM audit_events WHERE action='shipment.dispatch_blocked'`)[0].n >= 1, "machine-readable audit event recorded");
    // Operator adds the missing profile (sku is UNIQUE — one effective row per
    // SKU) and requeues -> booking succeeds with ALL items.
    await db.client`INSERT INTO sku_shipping_profiles (id,sku,weight_grams,storage_class,effective_from,version,created_at) VALUES ('prof_shake2','YBS-045',45,'shelf_stable',now(),2,now())`;
    const ops = new persistence.PostgresOperations(db, { writesEnabled: true, checkoutAdmission: "enabled", environment: "test" });
    await ops.requeueShipment("packer", "rq1", "ord_partial", "TEST_ONLY profile fixed");
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/v1/orders") && init?.method === "POST") { posts += 1; bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_fixed", price: 20000, currency: "IDR", status: "confirmed", courier: { waybill_id: "WYB-F", company: "JNE" } }) }; }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };
    await runShipmentDispatch(db, "t2");
    assert.equal(bodies.length, 1, "requeued dispatch books exactly once");
    assert.equal(bodies[0].items.length, 2, "complete item list after fix");
    assert.deepEqual(bodies[0].items.map((item) => item.sku).sort(), ["YBF-250", "YBS-045"]);
    assert.equal(bodies[0].items.find((item) => item.sku === "YBF-250").quantity, 2);
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-B valid mixed-SKU order books the exact purchased goods; recall blocks dispatch", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv();
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    await db.client`INSERT INTO sku_shipping_profiles (id,sku,weight_grams,length_cm,width_cm,height_cm,storage_class,effective_from,version,created_at)
      VALUES ('prof_shake','YBS-045',45,8,5,2,'shelf_stable',now(),1,now())`;
    const repo = new persistence.PostgresShipmentRepository(db);
    // Exact representation: quantities and values come from the order lines.
    const twoLines = [...LINES, { id: "shake-1", productId: "shake", productName: "Shake Yubie", sizeId: "sachet", sizeLabel: "1 sachet", quantity: 3, unitPrice: 19500 }];
    await seedOrder(db, "ord_mixed", { lines: twoLines });
    await repo.ensureForPaidOrder({ orderId: "ord_mixed", checkoutRef: "ref_ord_mixed", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_mixed" }, currency: "IDR" }, NOW());
    await pack(db, "ord_mixed");
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/v1/orders") && init?.method === "POST") { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_m", price: 20000, currency: "IDR", status: "confirmed", courier: { waybill_id: "WYB-M", company: "JNE" } }) }; }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };
    await runShipmentDispatch(db, "t");
    assert.equal(bodies.length, 1);
    const shakeItem = bodies[0].items.find((item) => item.sku === "YBS-045");
    assert.equal(shakeItem.quantity, 3, "purchased quantity exact");
    assert.equal(shakeItem.value, 19500, "declared value is the real unit price");
    assert.equal(bodies[0].items.find((item) => item.sku === "YBF-250").weight, 260, "approved profile weight");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-B recalled lot blocks an already-packed shipment", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv();
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    const repo = new persistence.PostgresShipmentRepository(db);
    await seedOrder(db, "ord_recall");
    await repo.ensureForPaidOrder({ orderId: "ord_recall", checkoutRef: "ref_ord_recall", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_recall" }, currency: "IDR" }, NOW());
    await pack(db, "ord_recall");
    // Recall lands between packing and dispatch.
    await db.client`INSERT INTO inventory_lots (id,product_id,size_id,lot_code,quantity_on_hand,expiry_date,status,created_at,updated_at) VALUES ('lot_1','flour','250g','LOT-R1',0,'2030-01-01','recalled',now(),now()) ON CONFLICT DO NOTHING`;
    await db.client`INSERT INTO inventory_reservations (id,order_id,lot_id,product_id,size_id,quantity,status,expires_at,created_at,updated_at) VALUES ('res_1','ord_recall','lot_1','flour','250g',2,'consumed',now()+interval '1 day',now(),now()) ON CONFLICT DO NOTHING`;
    let posts = 0;
    globalThis.fetch = async (url, init) => { if (url.endsWith("/v1/orders") && init?.method === "POST") posts += 1; return { ok: true, status: 200, json: async () => ({ success: true }) }; };
    await runShipmentDispatch(db, "t");
    assert.equal(posts, 0, "recalled stock can never be dispatched");
    const shipment = (await db.client`SELECT status, blocked_reason FROM shipments WHERE order_id='ord_recall'`)[0];
    assert.equal(shipment.status, "held");
    assert.equal(shipment.blocked_reason, "INVENTORY_BLOCKED");
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-C subsidized free order: customer pays Rp0, merchant books and records the real courier cost", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv();
  const originalFetch = globalThis.fetch;
  try {
    await seedBase(db);
    const repo = new persistence.PostgresShipmentRepository(db);
    // Subsidized free_promotional shipping snapshot (as TX1 writes it).
    await seedOrder(db, "ord_free", { shipping: { policy: "free_promotional", amount: 0, quoteId: "sq_free" }, quotePrice: 18000 });
    const order = (await db.client`SELECT grand_total_amount, shipping_jsonb FROM orders WHERE id='ord_free'`)[0];
    assert.equal(order.grand_total_amount, 70000, "customer total excludes shipping (iPaymu integrity)");
    assert.equal(order.shipping_jsonb.subsidyAmountIdr, 18000);
    // Payment success -> shipment despite the Rp0 policy.
    assert.equal(await repo.ensureForPaidOrder({ orderId: "ord_free", checkoutRef: "ref_ord_free", shipping: { policy: "free_promotional", amount: 0, quoteId: "sq_free", providerAmountIdr: 18000, subsidyAmountIdr: 18000 }, currency: "IDR" }, NOW()), "created");
    await pack(db, "ord_free");
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/v1/orders") && init?.method === "POST") { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_free", price: 18000, currency: "IDR", status: "confirmed", courier: { waybill_id: "WYB-FR", company: "JNE", type: "reg" } }) }; }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };
    await runShipmentDispatch(db, "t");
    assert.equal(bodies.length, 1, "free order dispatches automatically after packing");
    const kinds = (await db.client`SELECT kind, amount_idr FROM shipment_finance_events WHERE order_id='ord_free' ORDER BY created_at`);
    const byKind = Object.fromEntries(kinds.map((row) => [row.kind, row.amount_idr]));
    assert.equal(byKind.customer_charged, 0, "customer shipping charge Rp0");
    assert.equal(byKind.merchant_subsidy, 18000, "merchant subsidy recorded");
    assert.equal(byKind.provider_booked, 18000, "actual courier expense recorded");
    assert.equal((await db.client`SELECT actual_amount_idr FROM shipments WHERE order_id='ord_free'`)[0].actual_amount_idr, 18000);
  } finally { globalThis.fetch = originalFetch; restore(); await cleanup(); }
});

test("P0-C historic plain-free order stays manual (no backfill)", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restore = setEnv();
  try {
    await seedBase(db);
    const repo = new persistence.PostgresShipmentRepository(db);
    assert.equal(await repo.ensureForPaidOrder({ orderId: "ord_hist", checkoutRef: "ref_ord_hist", shipping: { policy: "free_promotional", amount: 0 }, currency: "IDR" }, NOW()), "skipped");
    assert.equal((await db.client`SELECT COUNT(*)::int AS n FROM shipments`)[0].n, 0);
  } finally { restore(); await cleanup(); }
});
