import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase} from '@yubie/persistence';
import {processGrowthCrm} from '../dist/growth-crm-handler.js';

// WA-04: B2B lead -> CRM projection from the transactional outbox. Exactly-once
// per lead, replay-safe, outage-surviving (GOAL_PLAN D14/D25/G-F, local half).
const enabled=!!process.env.DATABASE_URL;
let db,admin,name;
before(async()=>{
  if(!enabled)return;
  name='yubi_wa04_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=createDatabase(url.toString());
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
});
after(async()=>{if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}});

async function seedLead({business,intent='bulk',email}) {
  const leadId='lead_'+randomUUID();
  const now=new Date().toISOString();
  await db.client`INSERT INTO b2b_leads (id,name,business,type,city,email,whatsapp,need,intent,interest,message,status,source,consent_version,consented_at,created_at,updated_at)
    VALUES (${leadId},${'Kontak '+business},${business},${'reseller'},${'Bandung'},${email},${'+6281234567890'},${'FREE TEXT NEED yang tidak boleh masuk CRM'},${intent},${'flour'},${'FREE TEXT MESSAGE'},${'new'},${'web'},${'2026-10'},${now},${now},${now})`;
  const eventId='evt_'+randomUUID();
  await db.client`INSERT INTO outbox_events (id,event_type,aggregate_type,aggregate_id,dedupe_key,payload_json,available_at)
    VALUES (${eventId},${'growth.b2b_lead_created'},${'b2b_lead'},${leadId},${'b2b_lead:'+leadId},${JSON.stringify({leadId,business,intent,city:'Bandung',type:'reseller'})},${now})`;
  return {leadId,eventId};
}

test('a lead projects to exactly one account/contact/opportunity/task; replay is a no-op',{skip:!enabled},async()=>{
  const {leadId,eventId}=await seedLead({business:'Toko Ubi Jaya',email:'ops@ubijaya.example'});
  await processGrowthCrm(db);
  const [event]=await db.client`SELECT status FROM outbox_events WHERE id=${eventId}`;
  assert.equal(event.status,'published');
  const opps=await db.client`SELECT o.*,a.name AS account_name FROM b2b_opportunities o JOIN b2b_accounts a ON a.id=o.account_id WHERE o.lead_id=${leadId}`;
  assert.equal(opps.length,1);
  assert.equal(opps[0].account_name,'Toko Ubi Jaya');
  assert.equal(opps[0].stage,'new');
  assert.equal(opps[0].owner,'unassigned');
  assert.ok(opps[0].next_action_at,'mandatory next action exists');
  const tasks=await db.client`SELECT * FROM b2b_tasks WHERE opportunity_id=${opps[0].id}`;
  assert.equal(tasks.length,1);
  const contacts=await db.client`SELECT * FROM b2b_contacts WHERE account_id=${opps[0].account_id}`;
  assert.equal(contacts.length,1);
  assert.equal(contacts[0].email,'ops@ubijaya.example');

  // Replay the same event (reset to pending): exactly-once by lead_id.
  await db.client`UPDATE outbox_events SET status='pending',attempt_count=0,available_at=now() WHERE id=${eventId}`;
  await processGrowthCrm(db);
  assert.equal((await db.client`SELECT id FROM b2b_opportunities WHERE lead_id=${leadId}`).length,1);
  assert.equal((await db.client`SELECT id FROM b2b_tasks`).length,1);
});

test('D25: a CRM outage keeps the lead in the outbox and replays to exactly one opportunity',{skip:!enabled},async()=>{
  const {leadId,eventId}=await seedLead({business:'Catering Sehat Nusantara',email:'hi@catering.example'});
  await db.client.unsafe("CREATE FUNCTION yubi_crm_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic crm outage'; RETURN NEW; END $$; CREATE TRIGGER yubi_crm_fail BEFORE INSERT ON b2b_opportunities FOR EACH ROW EXECUTE FUNCTION yubi_crm_fail()");
  try {
    await assert.rejects(processGrowthCrm(db),/GROWTH_CRM_RETRY_PENDING/);
    const [event]=await db.client`SELECT status,last_error_code FROM outbox_events WHERE id=${eventId}`;
    assert.equal(event.status,'pending');
    assert.equal(event.last_error_code,'CRM_PROCESSING_FAILED');
    assert.equal((await db.client`SELECT id FROM b2b_opportunities WHERE lead_id=${leadId}`).length,0,'nothing half-projected');
  } finally {
    await db.client.unsafe('DROP TRIGGER yubi_crm_fail ON b2b_opportunities; DROP FUNCTION yubi_crm_fail()');
  }
  await db.client`UPDATE outbox_events SET available_at=now() WHERE id=${eventId}`;
  await processGrowthCrm(db);
  const [event]=await db.client`SELECT status FROM outbox_events WHERE id=${eventId}`;
  assert.equal(event.status,'published');
  assert.equal((await db.client`SELECT id FROM b2b_opportunities WHERE lead_id=${leadId}`).length,1);
});

test('a second lead from the same business converges on one account; free text never enters CRM',{skip:!enabled},async()=>{
  const first=await seedLead({business:'Warung Purple',email:'a@wp.example'});
  const second=await seedLead({business:'warung purple',email:'b@wp.example'});
  await processGrowthCrm(db);
  const accounts=await db.client`SELECT id FROM b2b_accounts WHERE normalized_name='warung purple'`;
  assert.equal(accounts.length,1);
  const opps=await db.client`SELECT id FROM b2b_opportunities WHERE lead_id IN (${first.leadId},${second.leadId})`;
  assert.equal(opps.length,2);
  const allText=JSON.stringify(await db.client`SELECT * FROM b2b_accounts`) + JSON.stringify(await db.client`SELECT * FROM b2b_opportunities`) + JSON.stringify(await db.client`SELECT * FROM b2b_tasks`);
  assert.ok(!allText.includes('FREE TEXT'),'no lead free-text need/message copied into CRM rows');
});
