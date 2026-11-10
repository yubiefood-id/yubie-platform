import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresAssistantOutboxRepository,PostgresWebhookInboxRepository} from '@yubie/persistence';
import {FakeZammadClient,ZammadSupportProvider} from '@yubie/integrations';
import {deliverSupportOutbox} from '../dist/reply-delivery-handler.js';
import {processAssistantInbox} from '../dist/assistant-handler.js';

// WA-02: tri-mode selection, persisted mode state, priority human queue and
// takeover cancellation (GOAL_PLAN D01/D04/D11/D12 evidence, local half).
const enabled=!!process.env.DATABASE_URL;
let db,admin,config,name,testDbUrl;
const savedEnv={};
before(async()=>{
  if(!enabled)return;
  name='yubi_wa02_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;testDbUrl=url.toString();db=createDatabase(testDbUrl);
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  config=new PostgresRuntimeConfigRepository(db);
  await config.set('assistant_enabled',true,'test',new Date().toISOString());
  await config.set('deterministic_flow_version','deterministic-v2','test',new Date().toISOString());
  await config.set('mode','auto','test',new Date().toISOString());
  await config.set('ai_assist_enabled',true,'test',new Date().toISOString());
  for(const key of ['ZAMMAD_PRIORITY_HIGH']){savedEnv[key]=process.env[key];process.env[key]=key==='ZAMMAD_PRIORITY_HIGH'?'3':process.env[key];}
});
after(async()=>{
  if(db)await closeDatabase(db);
  if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}
  for(const [key,value] of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

function seedThread(client,thread) {
  const now=new Date().toISOString();
  client.tickets.set(String(thread),{id:thread,number:String(thread),title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
}
function seedArticle(client,thread,id,text) {
  const now=new Date().toISOString();
  client.articles.set(String(id),{id,ticket_id:thread,body:text,content_type:'text/plain',internal:false,sender:'Customer',type:'whatsapp message',type_id:1,created_at:now,created_by_id:5,from:'synthetic',to:'synthetic',subject:''});
}
async function turn(provider,thread,text) {
  const id=9000+Number(thread)*10+seedCounter++;
  seedArticle(provider.client,thread,id,text);
  const r=await new PostgresWebhookInboxRepository(db).insert({provider:'zammad',deliveryId:`wa02-${id}-${randomUUID().slice(0,8)}`,payloadHash:`wa02-${id}`,eventType:'article_created',conversationRef:String(thread),messageRef:String(id),receivedAt:new Date().toISOString()});
  await processAssistantInbox(db,r.value.id,provider);
}
let seedCounter=0;

test('explicit consent persists AI_OPT_IN mode with audit; menu exits back to DETERMINISTIC',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=50;
  seedThread(client,thread);
  await turn(provider,thread,'7');
  await turn(provider,thread,'1');
  let [mode]=await db.client`SELECT mode FROM conversation_mode_state WHERE provider='zammad' AND provider_thread_id=${String(thread)}`;
  assert.equal(mode.mode,'AI_OPT_IN');
  let events=await db.client`SELECT from_mode,to_mode,trigger_kind FROM conversation_mode_events WHERE provider_thread_id=${String(thread)} ORDER BY created_at`;
  assert.equal(events.length,1);
  assert.equal(events[0].to_mode,'AI_OPT_IN');
  assert.equal(events[0].trigger_kind,'customer_opt_in');

  await turn(provider,thread,'menu');
  [mode]=await db.client`SELECT mode FROM conversation_mode_state WHERE provider_thread_id=${String(thread)}`;
  assert.equal(mode.mode,'DETERMINISTIC');
  events=await db.client`SELECT trigger_kind FROM conversation_mode_events WHERE provider_thread_id=${String(thread)} ORDER BY created_at`;
  assert.equal(events.length,2);
  assert.equal(events[1].trigger_kind,'customer_exit');
});

test('an AI question fails closed to the deterministic unavailable reply while WA-03 is unwired',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=51;
  seedThread(client,thread);
  await turn(provider,thread,'7');
  await turn(provider,thread,'1');
  await turn(provider,thread,'apa itu ubi ungu?');
  const replies=await db.client`SELECT payload_json FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='reply' ORDER BY created_at,id`;
  const last=JSON.parse(replies[replies.length-1].payload_json);
  assert.match(last.content,/belum tersedia/i);
});

test('explicit human request creates a P1 priority task with due time; replay never duplicates',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=52;
  seedThread(client,thread);
  await turn(provider,thread,'0');
  const handoffRow=await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='handoff'`;
  assert.equal(handoffRow.length,1);
  await deliverSupportOutbox(db,provider,handoffRow[0].id);
  const ticket=client.tickets.get(String(thread));
  assert.equal(ticket.group_id,2);
  assert.equal(ticket.priority_id,3,'P1 explicit human carries the high priority');
  let tasks=await db.client`SELECT priority,next_action_at,ack_at,reason FROM priority_support_tasks WHERE provider_thread_id=${String(thread)}`;
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].priority,'P1_EXPLICIT_HUMAN');
  const dueIn=Date.parse(tasks[0].next_action_at)-Date.now();
  assert.ok(dueIn>55*60*1000 && dueIn<65*60*1000,`due within the P1 hour window, got ${Math.round(dueIn/60000)}m`);
  // Replay-safety: re-running the same delivered action must not duplicate.
  await db.client`UPDATE assistant_outbox SET status='pending',attempt_count=0 WHERE id=${handoffRow[0].id}`;
  await deliverSupportOutbox(db,provider,handoffRow[0].id);
  tasks=await db.client`SELECT id FROM priority_support_tasks WHERE provider_thread_id=${String(thread)}`;
  assert.equal(tasks.length,1);
});

test('food safety handoff creates a P0 priority task with the 15-minute target',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=53;
  seedThread(client,thread);
  const repo=new PostgresAssistantOutboxRepository(db);
  const r=await repo.enqueue({provider:'zammad',providerThreadId:String(thread),conversationRef:String(thread),actionType:'handoff',payloadFingerprint:randomUUID(),payloadJson:JSON.stringify({intent:'FOOD_SAFETY',handoffReason:'food_safety'}),createdAt:new Date().toISOString()});
  await deliverSupportOutbox(db,provider,r.value.id);
  const [task]=await db.client`SELECT priority,next_action_at FROM priority_support_tasks WHERE provider_thread_id=${String(thread)}`;
  assert.equal(task.priority,'P0_FOOD_SAFETY');
  const dueIn=Date.parse(task.next_action_at)-Date.now();
  assert.ok(dueIn>10*60*1000 && dueIn<20*60*1000,`due within the P0 15-minute target, got ${Math.round(dueIn/60000)}m`);
});

test('human takeover cancels pending bot replies and ends an active AI session (D12)',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=54;
  seedThread(client,thread);
  await turn(provider,thread,'7');
  await turn(provider,thread,'1');
  // A queued bot reply is in flight when the agent takes the ticket.
  const repo=new PostgresAssistantOutboxRepository(db);
  const queued=await repo.enqueue({provider:'zammad',providerThreadId:String(thread),conversationRef:String(thread),actionType:'reply',payloadFingerprint:randomUUID(),payloadJson:JSON.stringify({content:'queued before takeover'}),createdAt:new Date().toISOString()});
  const takeoverTicket=client.tickets.get(String(thread));
  takeoverTicket.owner_id=9;
  await turn(provider,thread,'menu');
  const [session]=await db.client`SELECT state FROM conversation_sessions WHERE provider='zammad' AND provider_thread_id=${String(thread)}`;
  assert.equal(session.state,'HUMAN_ACTIVE');
  const [cancelled]=await db.client`SELECT status,last_error FROM assistant_outbox WHERE id=${queued.value.id}`;
  assert.equal(cancelled.status,'cancelled');
  assert.equal(cancelled.last_error,'human_takeover');
  const [mode]=await db.client`SELECT mode FROM conversation_mode_state WHERE provider_thread_id=${String(thread)}`;
  assert.equal(mode.mode,'DETERMINISTIC');
  const [event]=await db.client`SELECT trigger_kind FROM conversation_mode_events WHERE provider_thread_id=${String(thread)} ORDER BY created_at DESC LIMIT 1`;
  assert.equal(event.trigger_kind,'human_takeover');
});
