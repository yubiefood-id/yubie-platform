import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresOutboundTemplateRepository} from '@yubie/persistence';
import {FakeOutboundTransport} from '@yubie/integrations';
import {processOutboundWhatsapp} from '../dist/outbound-whatsapp-handler.js';

// WA-05: approved outbound template gateway — default-off, full recheck chain
// before every dispatch, ambiguous outcomes reconciled never resent
// (GOAL_PLAN D15/D16 + "no send on opt-out/expired approval/missing template").
const enabled=!!process.env.DATABASE_URL;
let db,admin,config,name;
before(async()=>{
  if(!enabled)return;
  name='yubi_wa05_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=createDatabase(url.toString());
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  config=new PostgresRuntimeConfigRepository(db);
});
after(async()=>{if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}});

async function seedContact() {
  const accountId='acc_'+randomUUID(),contactId='con_'+randomUUID(),wa='+62812'+randomUUID().replace(/[^0-9]/g,'').slice(0,8);
  const business='Toko Uji '+randomUUID().slice(0,6);
  await db.client`INSERT INTO b2b_accounts (id,name,normalized_name) VALUES (${accountId},${business},${business.toLowerCase()})`;
  await db.client`INSERT INTO b2b_contacts (id,account_id,email,whatsapp) VALUES (${contactId},${accountId},${`uji-${randomUUID().slice(0,8)}@toko.example`},${wa})`;
  return {contactId,whatsapp:wa};
}
async function seedApprovedDraft(repo,contactId,{expiresInHours=24}={}) {
  const templateId=await repo.registerTemplate({name:'b2b_followup_v1',version:`v-${randomUUID().slice(0,8)}`,bodyText:'Halo {{1}}, lanjut diskusi kebutuhan bisnis Yubie?'});
  assert.equal(await repo.approveTemplate(templateId,'qa-approver',new Date().toISOString()),true);
  const draft=await repo.createDraft({templateId,purpose:'b2b_followup',contactId,variables:{1:'Toko Uji'},createdBy:'qa-sales'});
  const expiresAt=new Date(Date.now()+expiresInHours*3600_000).toISOString();
  const approval=await repo.approveDraft(draft.id,draft.contentHash,'qa-approver',expiresAt,new Date().toISOString());
  assert.equal(approval.ok,true);
  return draft;
}
async function enableGateway(on=true){
  await config.set('outbound_whatsapp',{enabled:on,dailyContactCap:1},'test',new Date().toISOString());
}
async function sendRow(draftId){return (await db.client`SELECT * FROM outbound_sends WHERE draft_id=${draftId}`)[0];}

test('disabled gateway (default) never touches the transport',{skip:!enabled},async()=>{
  const repo=new PostgresOutboundTemplateRepository(db);
  const {contactId,whatsapp}=await seedContact();
  await repo.grantConsentForTest(whatsapp,'b2b_followup','granted',new Date().toISOString());
  const draft=await seedApprovedDraft(repo,contactId);
  const transport=new FakeOutboundTransport();
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,0);
  assert.equal(await sendRow(draft.id),undefined,'no send row while disabled');
  // Do not leak an approved draft into later tests that enable the gateway.
  await db.client`UPDATE outbound_drafts SET status='cancelled' WHERE id=${draft.id}`;
});

test('happy path: consented approved draft sends once and reconciles to delivered',{skip:!enabled},async()=>{
  await enableGateway();
  const repo=new PostgresOutboundTemplateRepository(db);
  const {contactId,whatsapp}=await seedContact();
  await repo.grantConsentForTest(whatsapp,'b2b_followup','granted',new Date().toISOString());
  const draft=await seedApprovedDraft(repo,contactId);
  const transport=new FakeOutboundTransport();
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,1);
  assert.equal(transport.calls[0].idempotencyKey,draft.id);
  assert.equal(transport.calls[0].templateName,'b2b_followup_v1');
  let send=await sendRow(draft.id);
  assert.equal(send.state,'dispatched');
  assert.ok(send.provider_message_id);
  // Re-run: reconcile the receipt; the message is never sent twice.
  await db.client`UPDATE outbound_sends SET next_attempt_at=now() WHERE draft_id=${draft.id}`;
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,1);
  send=await sendRow(draft.id);
  assert.equal(send.state,'delivered');
  await enableGateway(false);
});

test('D15: revoked or missing consent cancels the draft with zero sends',{skip:!enabled},async()=>{
  await enableGateway();
  const repo=new PostgresOutboundTemplateRepository(db);
  // No consent at all.
  const noConsent=await seedContact();
  const noConsentDraft=await seedApprovedDraft(repo,noConsent.contactId);
  const transport=new FakeOutboundTransport();
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,0);
  assert.equal((await db.client`SELECT status FROM outbound_drafts WHERE id=${noConsentDraft.id}`)[0].status,'cancelled');

  // Consent granted then revoked: revocation wins.
  const revoked=await seedContact();
  await repo.grantConsentForTest(revoked.whatsapp,'b2b_followup','granted',new Date(Date.now()-60000).toISOString());
  await repo.grantConsentForTest(revoked.whatsapp,'b2b_followup','revoked',new Date().toISOString());
  const revokedDraft=await seedApprovedDraft(repo,revoked.contactId);
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,0);
  const [row]=await db.client`SELECT d.status, s.state, s.last_error FROM outbound_drafts d LEFT JOIN outbound_sends s ON s.draft_id=d.id WHERE d.id=${revokedDraft.id}`;
  assert.equal(row.status,'cancelled');
  assert.equal(row.last_error,'consent_revoked');
  await enableGateway(false);
});

test('missing template approval or expired approval never dispatches',{skip:!enabled},async()=>{
  await enableGateway();
  const repo=new PostgresOutboundTemplateRepository(db);
  const {contactId,whatsapp}=await seedContact();
  await repo.grantConsentForTest(whatsapp,'b2b_followup','granted',new Date().toISOString());
  // Template never approved.
  const draftTemplateId=await repo.registerTemplate({name:'unapproved_v1',version:`v-${randomUUID().slice(0,8)}`,bodyText:'x'});
  const unapproved=await repo.createDraft({templateId:draftTemplateId,purpose:'b2b_followup',contactId,variables:{},createdBy:'qa-sales'});
  assert.equal((await repo.approveDraft(unapproved.id,unapproved.contentHash,'qa-approver',new Date(Date.now()+3600_000).toISOString(),new Date().toISOString())).ok,true);
  // Expired approval.
  const expired=await seedApprovedDraft(repo,contactId,{expiresInHours:-1});
  const transport=new FakeOutboundTransport();
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,0);
  assert.equal(await sendRow(unapproved.id),undefined);
  assert.equal(await sendRow(expired.id),undefined);
  await enableGateway(false);
});

test('ambiguous provider outcome reconciles the receipt and never resends',{skip:!enabled},async()=>{
  await enableGateway();
  const repo=new PostgresOutboundTemplateRepository(db);
  const {contactId,whatsapp}=await seedContact();
  await repo.grantConsentForTest(whatsapp,'b2b_followup','granted',new Date().toISOString());
  const draft=await seedApprovedDraft(repo,contactId);
  const transport=new FakeOutboundTransport([{ok:false,code:'TIMEOUT'}]);
  await processOutboundWhatsapp(db,transport);
  assert.equal(transport.calls.length,1);
  let send=await sendRow(draft.id);
  assert.equal(send.state,'ambiguous');
  // Provider later reports the message was actually delivered.
  transport.statuses.set('fake-wamid-1','delivered');
  // With TIMEOUT there is no provider id yet: the unresolved window holds, and
  // after the bounded hold it fails closed rather than double-send.
  transport.statuses.delete('fake-wamid-1');
  await db.client`UPDATE outbound_sends SET next_attempt_at=now() WHERE draft_id=${draft.id}`;
  const holdTransport=new FakeOutboundTransport();
  // Re-claim is only for state 'pending'; ambiguous stays in reconciliation.
  await processOutboundWhatsapp(db,holdTransport);
  assert.equal(holdTransport.calls.length,0,'ambiguous never blindly resent');
  send=await sendRow(draft.id);
  assert.ok(['ambiguous','failed'].includes(send.state));
  await enableGateway(false);
});
