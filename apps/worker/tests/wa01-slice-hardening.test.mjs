import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresAssistantOutboxRepository,PostgresWebhookInboxRepository} from '@yubie/persistence';
import {FakeZammadClient,ZammadSupportProvider} from '@yubie/integrations';
import {deliverSupportOutbox} from '../dist/reply-delivery-handler.js';
import {processAssistantInbox} from '../dist/assistant-handler.js';

// WA-01 vertical-slice hardening: the 24-hour service window and unknown
// inbound media are staging acceptance axes in GOAL_PLAN WA-01; these tests
// pin the local contract half of that evidence. Physical device-to-device
// receipts stay BLOCKED_EXTERNAL until Meta/Zammad staging is provisioned.
const enabled=!!process.env.DATABASE_URL;
let db,admin,config,name,testDbUrl;
before(async()=>{
  if(!enabled)return;
  name='yubi_wa01_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;testDbUrl=url.toString();db=createDatabase(testDbUrl);
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  config=new PostgresRuntimeConfigRepository(db);
  await config.set('assistant_enabled',true,'test',new Date().toISOString());
  await config.set('deterministic_flow_version','deterministic-v2','test',new Date().toISOString());
  await config.set('mode','auto','test',new Date().toISOString());
});
after(async()=>{if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}});

function seedTicket(client,thread) {
  const now=new Date().toISOString();
  client.tickets.set(String(thread),{id:thread,number:String(thread),title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
}
function seedCustomerArticle(client,thread,id,createdAt,body='menu',type='whatsapp message') {
  client.articles.set(String(id),{id,ticket_id:thread,body,content_type:'text/plain',internal:false,sender:'Customer',type,type_id:1,created_at:createdAt,created_by_id:5,from:'synthetic',to:'synthetic',subject:''});
  client.articlesByTicket.set(String(thread),[client.articles.get(String(id))]);
}
async function enqueueReply(thread,payload={}) {
  const repo=new PostgresAssistantOutboxRepository(db);
  const r=await repo.enqueue({provider:'zammad',providerThreadId:String(thread),conversationRef:String(thread),actionType:'reply',payloadFingerprint:randomUUID(),payloadJson:JSON.stringify({content:'halo dari Yubi',...payload}),createdAt:new Date().toISOString()});
  return r.value.id;
}

test('a queued reply after the 24-hour service window expires is cancelled, never sent',{skip:!enabled},async()=>{
  const client=new FakeZammadClient();
  const support=new ZammadSupportProvider(client,'whatsapp message');
  const staleThread=30,freshThread=31;
  seedTicket(client,staleThread);seedTicket(client,freshThread);
  seedCustomerArticle(client,staleThread,3001,new Date(Date.now()-25*60*60*1000).toISOString());
  seedCustomerArticle(client,freshThread,3101,new Date(Date.now()-60*60*1000).toISOString());

  const staleId=await enqueueReply(staleThread);
  await deliverSupportOutbox(db,support,staleId);
  const [stale]=await db.client`SELECT * FROM assistant_outbox WHERE id=${staleId}`;
  assert.equal(stale.status,'cancelled');
  assert.equal(stale.last_error,'service_window_closed');
  assert.equal(client.articlesByTicket.get(String(staleThread)).length,1,'no customer article added to the stale thread');

  // Positive control on the same code path: a fresh window must dispatch.
  const freshId=await enqueueReply(freshThread);
  await deliverSupportOutbox(db,support,freshId);
  const [fresh]=await db.client`SELECT * FROM assistant_outbox WHERE id=${freshId}`;
  assert.equal(fresh.status,'accepted');
});

test('a reply with no resolvable customer timestamp at all is cancelled',{skip:!enabled},async()=>{
  const client=new FakeZammadClient();
  const support=new ZammadSupportProvider(client,'whatsapp message');
  const thread=33;
  seedTicket(client,thread);
  // No customer article and no payload customerReceivedAt: the window can
  // never be proven open, so dispatch must fail closed.
  const id=await enqueueReply(thread);
  await deliverSupportOutbox(db,support,id);
  const [row]=await db.client`SELECT * FROM assistant_outbox WHERE id=${id}`;
  assert.equal(row.status,'cancelled');
  assert.equal(row.last_error,'service_window_closed');
});

test('a media-only inbound article answers with the deterministic unsupported copy, never a crash or echo',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),now=new Date().toISOString(),thread=32;
  seedTicket(client,thread);
  // Media-only WhatsApp inbound: no body text at all.
  seedCustomerArticle(client,thread,3201,now,'');
  const inbox=new PostgresWebhookInboxRepository(db);
  const r=await inbox.insert({provider:'zammad',deliveryId:'wa01-media',payloadHash:'wa01-media',eventType:'article_created',conversationRef:String(thread),messageRef:'3201',receivedAt:now});
  const support=new ZammadSupportProvider(client,'whatsapp message');
  await processAssistantInbox(db,r.value.id,support);

  const [processed]=await db.client`SELECT status FROM webhook_inbox WHERE id=${r.value.id}`;
  assert.equal(processed.status,'processed');
  const replies=await db.client`SELECT * FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='reply'`;
  assert.equal(replies.length,1);
  assert.match(replies[0].payload_json,/belum bisa membaca gambar/);
  assert.equal((await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='handoff'`).length,0);
  const [flow]=await db.client`SELECT node_id,fallback_count FROM conversation_flow_state WHERE provider_thread_id=${String(thread)}`;
  assert.equal(flow.node_id,'HOME');
  assert.equal(flow.fallback_count,1);
});

test('customer articles of a non-WhatsApp type are ignored as inbound',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),now=new Date().toISOString(),thread=34;
  seedTicket(client,thread);
  seedCustomerArticle(client,thread,3401,now,'halo','phone');
  const inbox=new PostgresWebhookInboxRepository(db);
  const r=await inbox.insert({provider:'zammad',deliveryId:'wa01-phone',payloadHash:'wa01-phone',eventType:'article_created',conversationRef:String(thread),messageRef:'3401',receivedAt:now});
  const support=new ZammadSupportProvider(client,'whatsapp message');
  await processAssistantInbox(db,r.value.id,support);

  const [processed]=await db.client`SELECT status FROM webhook_inbox WHERE id=${r.value.id}`;
  assert.equal(processed.status,'processed');
  assert.equal((await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref=${String(thread)}`).length,0);
  assert.equal((await db.client`SELECT id FROM conversation_flow_state WHERE provider_thread_id=${String(thread)}`).length,0);
});
