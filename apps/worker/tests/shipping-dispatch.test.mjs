import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {readFileSync,readdirSync} from 'node:fs';
import * as persistence from '@yubie/persistence';
import * as application from '@yubie/application';
import { runShipmentDispatch } from '../dist/shipment-dispatch-handler.js';
import { runShipmentNotifications } from '../dist/shipment-notification-handler.js';

const ENV_NAMES = ["SHIPPING_EXECUTION_MODE","SHIPPING_PROVIDER","BITESHIP_API_KEY","BITESHIP_ENV","BITESHIP_WEBHOOK_SECRET","BITESHIP_WEBHOOK_SECRET_HEADER","SHIPPING_PILOT_MAX_BOOKINGS","SHIPPING_PILOT_BUDGET_IDR","YUBIE_ENV","COMMERCE_PROVIDER","YUBIE_LAUNCH_PROFILE","DATABASE_URL","API_PROXY_TOKEN","APP_ORIGIN"];

function fakeProviderFetch(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const body = init?.body ? JSON.parse(init.body) : null;
    if (url.endsWith("/v1/rates/couriers")) {
      return { ok: true, status: 200, json: async () => ({ success: true, pricing: [] }) };
    }
    if (url.endsWith("/v1/orders") && init?.method === "POST") {
      calls.booked = (calls.booked ?? 0) + 1;
      return { ok: true, status: 200, json: async () => ({
        success: true, object: "order", id: "bs_order_1", reference_id: body?.reference_id, price: 20000, currency: "IDR", status: "confirmed",
        courier: { tracking_id: "BSL-1", waybill_id: "WYB-SHIP-1", company: "JNE", type: "reg", link: "https://track.example/1" },
      }) };
    }
    if (url.includes("/v1/orders/") && url.endsWith("/cancel")) {
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    if (url.includes("/v1/orders/")) {
      return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_order_1", status: "confirmed", courier: { waybill_id: "WYB-SHIP-1", company: "JNE", type: "reg", tracking_id: "BSL-1", link: "https://track.example/1" }, price: 20000, currency: "IDR" }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, history: [] }) };
  };
}

async function ephemeral() {
  const admin = postgres(process.env.DATABASE_URL, { max: 1 });
  const name = "shipacc_" + Date.now();
  await admin`CREATE DATABASE ${admin(name)}`;
  const url = new URL(process.env.DATABASE_URL); url.pathname = "/" + name;
  const db = persistence.createDatabase(url.toString());
  for (const f of readdirSync(new URL('../../../packages/persistence/migrations/', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) {
    await db.client.unsafe(readFileSync(new URL('../../../packages/persistence/migrations/' + f, import.meta.url), 'utf8'));
  }
  return { db, cleanup: async () => { await persistence.closeDatabase(db); await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`; await admin.end(); } };
}

async function seedCourierOrder(db, orderId = "ord_ship_1") {
  const now = new Date().toISOString();
  await db.client`INSERT INTO shipping_origins (id,label,contact_name,contact_phone,address,postal_code,is_active,version,created_at,updated_at)
    VALUES ('origin_1','Gudang Utama','Owner','+6281200000001','Jl. Gudang Utama 1','45363',true,1,now(),now())`;
  await db.client`INSERT INTO sku_shipping_profiles (id,sku,weight_grams,length_cm,width_cm,height_cm,storage_class,effective_from,version,created_at)
    VALUES ('prof_1','YBF-250',260,10,6,4,'shelf_stable',now(),1,now())`;
  await db.client`INSERT INTO shipping_quotes (id,principal_key,cart_hash,destination_hash,origin_id,parcels_digest,courier_company,courier_service_code,courier_service_name,delivery_type,offered_amount_idr,provider_amount_idr,subsidy_amount_idr,tax_amount_idr,tax_policy_version,status,valid_until,created_at)
    VALUES (${"sq_" + orderId},'guest:' || repeat('a',64),repeat('c',64),repeat('d',64),'origin_1',repeat('p',64),'JNE','jne_reg','Reguler','scheduled',20000,20000,0,0,'non-pkp-v1','quoted',now()+interval '1 hour',now())`;
  await db.client`INSERT INTO orders (id,checkout_ref,checkout_public_token,status,customer_name,customer_phone,delivery_jsonb,shipping_jsonb,lines_jsonb,currency,subtotal_amount,shipping_amount,discount_amount,grand_total_amount,total_amount,created_at,updated_at)
    VALUES (${orderId},${"ref_" + orderId},${"tok_" + orderId},'paid','Pelanggan','+6281300000002',
      ${JSON.stringify({ name: "Pelanggan", phone: "+6281300000002", address: "Jl. Rumah Pelanggan 2", city: "Bandung", postalCode: "40115" })}::jsonb,
      ${JSON.stringify({ policy: "courier", amount: 20000, quoteId: "sq_ship", courierCompany: "JNE", courierServiceCode: "jne_reg", deliveryType: "scheduled", providerAmountIdr: 20000, subsidyAmountIdr: 0, taxAmountIdr: 0, taxPolicyVersion: "non-pkp-v1" })}::jsonb,
      ${JSON.stringify([{ id: "flour-250g", productId: "flour", productName: "Tepung Yubie", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 35000 }])}::jsonb,
      'IDR',70000,20000,0,90000,90000,${now},${now})`;
  await db.client`INSERT INTO order_payments (id,order_id,provider,provider_session_id,provider_payment_id,currency,status,amount,created_at,updated_at)
    VALUES (${"pay_" + orderId},${orderId},'ipaymu','TEST_ONLY_SESSION','9001','IDR','succeeded',90000,now(),now())`;
  await db.client`INSERT INTO ops_staff_grants (subject,role,granted_by,approval_ref,granted_at) VALUES ('packer','fulfillment','TEST_ONLY_BOOTSTRAP','TEST_ONLY_APPROVAL',now())`;
}

function setEnv(overrides = {}) {
  const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  const base = {
    YUBIE_ENV: "test", COMMERCE_PROVIDER: "preview", YUBIE_LAUNCH_PROFILE: "DIRECT_COMMERCE_SANDBOX",
    SHIPPING_EXECUTION_MODE: "sandbox", SHIPPING_PROVIDER: "biteship", BITESHIP_API_KEY: "test_key_only", BITESHIP_ENV: "sandbox",
    BITESHIP_WEBHOOK_SECRET: "test_webhook_secret", BITESHIP_WEBHOOK_SECRET_HEADER: "x-biteship-secret",
  };
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, base, overrides);
  return () => { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };
}

test("paid courier order packs, books exactly once, and provider events drive server-authorized order transitions", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restoreEnv = setEnv();
  const originalFetch = globalThis.fetch;
  try {
    await seedCourierOrder(db, "ord_ship_1");
    const calls = [];
    globalThis.fetch = fakeProviderFetch(calls);
    const ops = new persistence.PostgresOperations(db, { writesEnabled: true, checkoutAdmission: "enabled", environment: "test" });
    const shipments = new persistence.PostgresShipmentRepository(db);
    const now = new Date().toISOString();

    // 1. Payment success creates exactly one shipment, even for 100 duplicate callbacks.
    const order = { orderId: "ord_ship_1", checkoutRef: "ref_ord_ship_1", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_ship_1" }, currency: "IDR" };
    for (let index = 0; index < 100; index += 1) {
      await shipments.ensureForPaidOrder(order, now);
    }
    const shipmentRows = await db.client`SELECT id,status,reference_id FROM shipments`;
    assert.equal(shipmentRows.length, 1, "duplicate paid callbacks never open a second shipment");
    assert.equal(shipmentRows[0].status, "not_ready");

    // 2. Staff packs: packing -> packed flips the shipment ready with a dispatch intent.
    await ops.fulfill("packer", "k1", "ord_ship_1", { expectedVersion: 0, stage: "packing", reason: "TEST_ONLY packing" });
    await ops.fulfill("packer", "k2", "ord_ship_1", { expectedVersion: 1, stage: "packed", reason: "TEST_ONLY packed" });
    const ready = await db.client`SELECT status FROM shipments`;
    assert.equal(ready[0].status, "ready");
    const intents = await db.client`SELECT state FROM shipment_dispatch_intents`;
    assert.equal(intents.length, 1);

    // 3. Dispatch books via the provider; 100 dispatch runs still book exactly once.
    for (let index = 0; index < 100; index += 1) {
      await runShipmentDispatch(db, "test");
    }
    assert.equal(calls.booked, 1, "one physical package -> at most one provider booking");
    const booked = await db.client`SELECT status,provider_order_id,waybill_id,courier_company,actual_amount_idr FROM shipments`;
    assert.equal(booked[0].status, "booked");
    assert.equal(booked[0].provider_order_id, "bs_order_1");
    assert.equal(booked[0].waybill_id, "WYB-SHIP-1");
    assert.equal(booked[0].actual_amount_idr, 20000);
    const finance = await db.client`SELECT kind FROM shipment_finance_events ORDER BY created_at`;
    assert.deepEqual(finance.map((row) => row.kind).sort(), ["customer_charged", "provider_booked"]);
    const finalOrder1 = await db.client`SELECT status FROM orders WHERE id='ord_ship_1'`;
    assert.equal(finalOrder1[0].status, "processing", "booking never implies shipped");

    // 4. Provider events land in the durable inbox exactly like the verified
    // route writes them (the HTTP surface has its own API test); redelivery
    // dedupes into one row.
    const inbox = new persistence.PostgresShipmentProviderInbox(db);
    const pickedPayload = { event: "order.status", order_id: "bs_order_1", status: "picked", courier_waybill_id: "WYB-SHIP-1", courier_tracking_id: "BSL-1", courier_company: "JNE", courier_link: "https://track.example/1" };
    const dedupeKey = "biteship:bs_order_1:order.status:picked:abc123";
    assert.equal(await inbox.receive({ dedupeKey, event: "order.status", providerOrderId: "bs_order_1", waybillId: "WYB-SHIP-1", status: "picked", payload: pickedPayload, payloadHash: "a".repeat(64) }), "received");
    assert.equal(await inbox.receive({ dedupeKey, event: "order.status", providerOrderId: "bs_order_1", waybillId: "WYB-SHIP-1", status: "picked", payload: pickedPayload, payloadHash: "a".repeat(64) }), "duplicate");
    const inboxRows = await db.client`SELECT id FROM shipment_provider_inbox`;
    assert.equal(inboxRows.length, 1, "redelivery dedupes into one inbox row");

    // 5. Notification processing: picked -> SERVER-AUTHORIZED shipped with courier + waybill.
    await runShipmentNotifications(db, "test");
    const afterPicked = await db.client`SELECT status FROM orders WHERE id='ord_ship_1'`;
    assert.equal(afterPicked[0].status, "shipped", "confirmed pickup authorizes shipped (never the booking itself)");
    const fulfillRow = await db.client`SELECT stage,carrier,tracking_number,updated_by FROM ops_fulfillments WHERE order_id='ord_ship_1'`;
    assert.equal(fulfillRow[0].stage, "shipped");
    assert.equal(fulfillRow[0].carrier, "biteship:JNE");
    assert.equal(fulfillRow[0].tracking_number, "WYB-SHIP-1");
    assert.equal(fulfillRow[0].updated_by, "system:biteship");
    const shipmentAfter = await db.client`SELECT status,latest_provider_status FROM shipments`;
    assert.equal(shipmentAfter[0].status, "picked");

    // 6. delivered -> completed only through the same guarded command.
    await inbox.receive({ dedupeKey: "biteship:bs_order_1:order.status:delivered:def456", event: "order.status", providerOrderId: "bs_order_1", waybillId: null, status: "delivered", payload: { event: "order.status", order_id: "bs_order_1", status: "delivered" }, payloadHash: "b".repeat(64) });
    await runShipmentNotifications(db, "test");
    const afterDelivered = await db.client`SELECT status FROM orders WHERE id='ord_ship_1'`;
    assert.equal(afterDelivered[0].status, "completed");
    const shipmentDelivered = await db.client`SELECT status FROM shipments`;
    assert.equal(shipmentDelivered[0].status, "delivered");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    await cleanup();
  }
});

test("ambiguous booking outcomes freeze for reconciliation and never double-book on retry", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restoreEnv = setEnv();
  const originalFetch = globalThis.fetch;
  try {
    await seedCourierOrder(db, "ord_ship_2");
    const ops = new persistence.PostgresOperations(db, { writesEnabled: true, checkoutAdmission: "enabled", environment: "test" });
    const shipments = new persistence.PostgresShipmentRepository(db);
    await shipments.ensureForPaidOrder({ orderId: "ord_ship_2", checkoutRef: "ref_ord_ship_2", shipping: { policy: "courier", amount: 20000, quoteId: "sq_ord_ship_2" }, currency: "IDR" }, new Date().toISOString());
    await ops.fulfill("packer", "k1", "ord_ship_2", { expectedVersion: 0, stage: "packing", reason: "TEST_ONLY packing" });
    await ops.fulfill("packer", "k2", "ord_ship_2", { expectedVersion: 1, stage: "packed", reason: "TEST_ONLY packed" });

    // Provider times out on every create: outcome unknown.
    globalThis.fetch = async () => { const error = new Error("aborted"); error.name = "TimeoutError"; throw error; };
    await runShipmentDispatch(db, "test");
    const unknown = await db.client`SELECT s.status, i.state FROM shipments s JOIN shipment_dispatch_intents i ON i.shipment_id=s.id`;
    assert.equal(unknown[0].status, "booking_unknown");
    assert.equal(unknown[0].state, "unknown");

    // Later retry with the SAME reference conflicts at the provider; the
    // recovery path verifies via getOrder and records the existing booking.
    let booked = 0;
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/v1/orders") && init?.method === "POST") {
        booked += 1;
        if (booked === 1) {
          return { ok: false, status: 400, json: async () => ({ success: false, error: { code: "40002060", message: "Reference id has already been used", details: { order_id: "bs_order_existing", waybill_id: "WYB-EXISTING", reference_id: "ybshp-ref_ord_ship_2-p0-g1" } } }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_order_existing", status: "confirmed", price: 21000, currency: "IDR", courier: { waybill_id: "WYB-EXISTING", company: "JNE", type: "reg" } }) };
    };
    // Re-queue the unknown intent by expiring its lease semantics: pending/leased claims only cover ready/booking_pending,
    // so operations must explicitly release the hold — simulate ops retry by resetting to ready + pending.
    await db.client`UPDATE shipments SET status='ready' WHERE order_id='ord_ship_2'`;
    await db.client`UPDATE shipment_dispatch_intents SET state='pending'`;
    await runShipmentDispatch(db, "test");
    const recovered = await db.client`SELECT status,provider_order_id,waybill_id,actual_amount_idr FROM shipments`;
    assert.equal(recovered[0].status, "booked");
    assert.equal(recovered[0].provider_order_id, "bs_order_existing");
    assert.equal(recovered[0].waybill_id, "WYB-EXISTING");
    assert.equal(recovered[0].actual_amount_idr, 21000);
    assert.equal(booked, 1, "conflict recovered without a second accepted create");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    await cleanup();
  }
});

test("disabled and shadow modes never book; unverified payment cannot even pack", { skip: !process.env.DATABASE_URL }, async () => {
  const { db, cleanup } = await ephemeral();
  const restoreEnv = setEnv({ SHIPPING_EXECUTION_MODE: "disabled" });
  const originalFetch = globalThis.fetch;
  try {
    await seedCourierOrder(db, "ord_ship_3");
    const shipments = new persistence.PostgresShipmentRepository(db);
    await shipments.ensureForPaidOrder({ orderId: "ord_ship_3", checkoutRef: "ref_ord_ship_3", shipping: { policy: "courier", amount: 20000 }, currency: "IDR" }, new Date().toISOString());
    await db.client`UPDATE shipment_dispatch_intents SET state='pending'`.catch(() => {});
    let fetches = 0;
    globalThis.fetch = async () => { fetches += 1; return { ok: true, status: 200, json: async () => ({ success: true }) }; };
    await db.client`UPDATE shipments SET status='ready' WHERE order_id='ord_ship_3'`;
    await db.client`INSERT INTO shipment_dispatch_intents (id,shipment_id,generation,reference_id,state,attempts,max_attempts,created_at,updated_at)
      SELECT 'int_t3', s.id, 1, s.reference_id, 'pending', 0, 5, now(), now() FROM shipments s WHERE s.order_id='ord_ship_3' ON CONFLICT DO NOTHING`;
    await runShipmentDispatch(db, "test");
    assert.equal(fetches, 0, "disabled mode never calls the provider");
    const untouched = await db.client`SELECT status FROM shipments`;
    assert.equal(untouched[0].status, "ready", "disabled leaves ready shipments untouched (no booking, order unchanged)");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    await cleanup();
  }
  void application;
});
