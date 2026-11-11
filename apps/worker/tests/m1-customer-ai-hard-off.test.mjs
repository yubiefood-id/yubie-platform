import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresAssistantOutboxRepository,PostgresWebhookInboxRepository} from '@yubie/persistence';
import {FakeZammadClient,ZammadSupportProvider} from '@yubie/integrations';
import {createAIAssistProviderFromEnv} from '@yubie/assistant';
import {deliverSupportOutbox} from '../dist/reply-delivery-handler.js';
import {processAssistantInbox} from '../dist/assistant-handler.js';

// Operator-AI pass, M1: the CUSTOMER-facing AI must stay deterministic.
// Pinned invariants: (1) the runtime switch alone (ai_assist_enabled) never
// enables the customer path without a complete live policy; (2) even with a
// live policy, an unconfigured provider is fail-closed — no model call is
// possible and the customer receives the deterministic fallback.
const enabled=!!process.env.DATABASE_URL;
let db,admin,config,name;
before(async()=>{
  if(!enabled)return;
  name='yubi_m1_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=createDatabase(url.toString());
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  config=new PostgresRuntimeConfigRepository(db);
  await config.set('assistant_enabled',true,'test',new Date().toISOString());
  await config.set('deterministic_flow_version','deterministic-v2','test',new Date().toISOString());
  await config.set('mode','auto','test',new Date().toISOString());
});
after(async()=>{if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}});

const POLICY={mode:'live',limits:{
  maxCallsPerConversation:3,maxCallsPerContactDay:5,maxInputTokens:1500,maxOutputTokens:250,
  timeoutMs:8000,contextTurns:4,globalDayTokens:100000,globalMonthCostMicrousd:10_000_000,
  priceMicrousdPerToken:1,priceVersion:'test-v1',
}};

function seedThread(client,thread) {
  const now=new Date().toISOString();
  client.tickets.set(String(thread),{id:thread,number:String(thread),title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
}
async function turn(provider,thread,text,id) {
  const now=new Date().toISOString();
  const article={id,ticket_id:thread,body:text,content_type:'text/plain',internal:false,sender:'Customer',type:'whatsapp message',type_id:1,created_at:now,created_by_id:5,from:'c',to:'b',subject:''};
  provider.client.articles.set(String(id),article);
  provider.client.articlesByTicket.set(String(thread),[article]);
  const r=await new PostgresWebhookInboxRepository(db).insert({provider:'zammad',deliveryId:`m1-${id}`,payloadHash:`m1-${id}`,eventType:'article_created',conversationRef:String(thread),messageRef:String(id),contactRef:'5',receivedAt:now});
  await processAssistantInbox(db,r.value.id,provider);
}

test('fresh runtime config keeps customer AI disabled by default',{skip:!enabled},async()=>{
  const snapshot=await config.getSnapshot();
  assert.equal(snapshot.aiAssistEnabled,false);
  assert.equal(snapshot.aiPolicy.mode,'off');
});

test('the switch alone (no live policy) leaves the AI menu entry a deterministic dead end',{skip:!enabled},async()=>{
  await config.set('ai_assist_enabled',true,'test',new Date().toISOString());
  const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=70;
  seedThread(client,thread);
  await turn(provider,thread,'7',7001);
  await turn(provider,thread,'1',7002);
  const [flow]=await db.client`SELECT node_id FROM conversation_flow_state WHERE provider_thread_id=${String(thread)}`;
  assert.notEqual(flow.node_id,'AI_ACTIVE','consent never opens without a live policy');
  assert.equal((await db.client`SELECT count(*)::int AS n FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='ai_answer'`)[0].n,0);
});

test('with a live policy but unconfigured provider, the customer still never reaches a model',{skip:!enabled},async()=>{
  await config.set('ai_assist_enabled',true,'test',new Date().toISOString());
  await config.set('ai_policy',POLICY,'test',new Date().toISOString());
  const previous=process.env.AI_ASSIST_PROVIDER;
  delete process.env.AI_ASSIST_PROVIDER;
  try {
    // Fail-closed factory: no provider configuration means a throwing no-op.
    assert.equal(createAIAssistProviderFromEnv().name,'throwing');

    const client=new FakeZammadClient(),provider=new ZammadSupportProvider(client,'whatsapp message'),thread=71;
    seedThread(client,thread);
    await turn(provider,thread,'7',7101);
    await turn(provider,thread,'1',7102);
    await turn(provider,thread,'apa itu ubi ungu?',7103);
    const [action]=await db.client`SELECT id,payload_fingerprint FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='ai_answer'`;
    assert.ok(action,'question became a durable ai_answer action');
    // Settle the menu replies already in flight (one customer effect per
    // conversation) so the ai_answer action can be claimed.
    await db.client`UPDATE assistant_outbox SET status='delivered' WHERE conversation_ref=${String(thread)} AND action_type='reply'`;
    await deliverSupportOutbox(db,provider,action.id);
    const [row]=await db.client`SELECT status,last_error FROM assistant_outbox WHERE id=${action.id}`;
    assert.equal(row.status,'cancelled');
    assert.match(row.last_error,/ai_provider/);
    const [reservation]=await db.client`SELECT state FROM ai_usage_reservations WHERE request_id=${action.payload_fingerprint}`;
    assert.equal(reservation.state,'failed','the failed attempt is terminally accounted');
    const replies=await db.client`SELECT payload_json FROM assistant_outbox WHERE conversation_ref=${String(thread)} AND action_type='reply' ORDER BY created_at,id`;
    const last=JSON.parse(replies[replies.length-1].payload_json);
    assert.match(last.content,/tidak bisa menjawab|Customer Service/i,'customer received a deterministic fallback');
  } finally {
    if(previous!==undefined)process.env.AI_ASSIST_PROVIDER=previous;
    await config.set('ai_policy',{mode:'off'},'test',new Date().toISOString());
    await config.set('ai_assist_enabled',false,'test',new Date().toISOString());
  }
});
