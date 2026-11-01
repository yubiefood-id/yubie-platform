import test from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {readFileSync,readdirSync} from 'node:fs';
import * as persistence from '../dist/index.js';

async function ephemeral() {
  const admin = postgres(process.env.DATABASE_URL, {max: 1});
  const name = "quotes_" + Date.now();
  await admin`CREATE DATABASE ${admin(name)}`;
  const url = new URL(process.env.DATABASE_URL); url.pathname = "/" + name;
  const db = persistence.createDatabase(url.toString());
  try {
    for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) {
      await db.client.unsafe(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
    }
  } catch (error) {
    await persistence.closeDatabase(db);
    await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`; await admin.end();
    throw error;
  }
  return {db, cleanup: async () => { await persistence.closeDatabase(db); await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`; await admin.end(); }};
}

const NOW = "2026-11-01T08:00:00.000Z";
const LATER = "2026-11-01T08:05:00.000Z";
const EXPIRED = "2026-11-01T08:11:00.000Z";

test('PostgresShippingQuoteRepository stores, reuses and consumes quotes exactly once',{skip:!process.env.DATABASE_URL},async()=>{
  const {db,cleanup} = await ephemeral();
  try{
    await db.client`INSERT INTO orders (id, checkout_ref, checkout_public_token, status, customer_email, total_amount, subtotal_amount, grand_total_amount, created_at, updated_at)
      VALUES ('ord_q','ref_q','tok_q','paid','ops@example.invalid',50000,50000,50000,now(),now())`;
    await db.client`INSERT INTO shipping_origins (id,label,contact_name,contact_phone,address,is_active,version,created_at,updated_at)
      VALUES ('origin_1','Gudang','Owner','0812','Jl. Gudang 1',true,1,now(),now())`;
    const repo = new persistence.PostgresShippingQuoteRepository(db);
    const record = (id, offered) => ({
      id, principalKey: 'guest:' + 'a'.repeat(64), cartHash: 'c'.repeat(64), destinationHash: 'd'.repeat(64), originId: 'origin_1',
      parcelsDigest: 'p'.repeat(64), courierCompany: 'JNE', courierServiceCode: 'jne_reg', courierServiceName: 'Reguler',
      serviceType: 'standard', deliveryType: 'scheduled', offeredAmountIdr: offered, providerAmountIdr: offered,
      subsidyAmountIdr: 0, taxAmountIdr: 0, taxPolicyVersion: 'non-pkp-v1', currency: 'IDR', status: 'quoted',
      validUntil: '2026-11-01T08:10:00.000Z', createdAt: NOW, consumedAt: null, orderId: null,
    });
    await repo.insert(record('sq_1', 22000));
    await repo.insert(record('sq_2', 18000));
    const usable = await repo.listUsable({principalKey: 'guest:' + 'a'.repeat(64), cartHash: 'c'.repeat(64), destinationHash: 'd'.repeat(64), now: NOW});
    assert.ok(usable.ok);
    assert.deepEqual(usable.value.map((row) => row.id), ['sq_2', 'sq_1'], 'cheapest first');
    // Different principal must not see another session's quotes.
    const other = await repo.listUsable({principalKey: 'guest:' + 'b'.repeat(64), cartHash: 'c'.repeat(64), destinationHash: 'd'.repeat(64), now: NOW});
    assert.deepEqual(other.value, []);
    // findById + consume binds to the order exactly once.
    const found = await repo.findById('sq_1', NOW);
    assert.equal(found.value.id, 'sq_1');
    assert.equal((await repo.consume('sq_1', 'ord_q', LATER)).value, true);
    assert.equal((await repo.consume('sq_1', 'ord_q', LATER)).value, false, 'second consumption refused');
    assert.equal((await repo.findById('sq_1', NOW)).value, null);
    assert.equal((await repo.consume('sq_2', 'ord_q', EXPIRED)).value, false, 'expired quote refused');
    const row = (await db.client`SELECT status, order_id, consumed_at FROM shipping_quotes WHERE id='sq_1'`)[0];
    assert.equal(row.status, 'consumed');
    assert.equal(row.order_id, 'ord_q');
  } finally { await cleanup(); }
});
