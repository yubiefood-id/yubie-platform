import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresAssistantOutboxRepository,PostgresAIUsageRepository,contactHashFor} from '@yubie/persistence';
import {FakeZammadClient,ZammadSupportProvider} from '@yubie/integrations';
import {FakeAIAssistProvider} from '@yubie/assistant';
import {deliverSupportOutbox} from '../dist/reply-delivery-handler.js';

// WA-03: bounded AI opt-in — atomic reservation before any model call, hard
// caps under concurrency, exactly-once accounting, deterministic fallbacks
// (GOAL_PLAN D03/D05/D06/D08/D17/D20, local half).
const enabled=!!process.env.DATABASE_URL;
let db,admin,config,name;
const POLICY={mode:'live',limits:{
  maxCallsPerConversation:2,maxCallsPerContactDay:5,maxInputTokens:1500,maxOutputTokens:250,
  timeoutMs:8000,contextTurns:4,globalDayTokens:100000,globalMonthCostMicrousd:10_000_000,
  priceMicrousdPerToken:1,priceVersion:'test-v1',
}};
before(async()=>{
  if(!enabled)return;
  name='yubi_wa03_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=createDatabase(url.toString());
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  config=new PostgresRuntimeConfigRepository(db);
  await config.set('assistant_enabled',true,'test',new Date().toISOString());
  await config.set('mode','auto','test',new Date().toISOString());
  await config.set('deterministic_flow_version','deterministic-v2','test',new Date().toISOString());
  await config.set('ai_assist_enabled',true,'test',new Date().toISOString());
  await config.set('ai_policy',POLICY,'test',new Date().toISOString());
});
after(async()=>{if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}});

function seedThread(client,thread) {
  const now=new Date().toISOString();
  client.tickets.set(String(thread),{id:thread,number:String(thread),title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
  client.articlesByTicket.set(String(thread),[{id:1,ticket_id:thread,body:'menu',content_type:'text/plain',internal:false,sender:'Customer',type:'whatsapp message',type_id:1,created_at:now,created_by_id:5,from:'c',to:'b',subject:''}]);
}
async function enqueueAI(thread,question) {
  const repo=new PostgresAssistantOutboxRepository(db);
  const r=await repo.enqueue({provider:'zammad',providerThreadId:String(thread),conversationRef:String(thread),actionType:'ai_answer',payloadFingerprint:randomUUID(),payloadJson:JSON.stringify({question,contactId:'5',threadId:String(thread),customerReceivedAt:new Date().toISOString()}),createdAt:new Date().toISOString()});
  return r.value.id;
}
async function outboxRow(id){return (await db.client`SELECT * FROM assistant_outbox WHERE id=${id}`)[0];}

test('D03: a valid AI question generates once, is validated, accounted once and sent',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),support=new ZammadSupportProvider(client,'whatsapp message'),thread=60;
  seedThread(client,thread);
  const ai=new FakeAIAssistProvider([{ok:true,text:'Ubi ungu adalah bahan utama produk Yubie.',usage:{inputTokens:210,outputTokens:22}}]);
  const id=await enqueueAI(thread,'apa itu ubi ungu?');
  await deliverSupportOutbox(db,support,id,undefined,ai);
  assert.equal(ai.calls,1);
  const row=await outboxRow(id);
  assert.equal(row.status,'accepted');
  assert.equal(ai.lastRequest.maxInputTokens,1500);
  const articles=client.articlesByTicket.get(String(thread)).filter(a=>a.sender==='Agent');
  assert.equal(articles.length,1);
  assert.match(articles[0].body,/ubi ungu/i);
  const [res]=await db.client`SELECT * FROM ai_usage_reservations WHERE request_id=${row.payload_fingerprint}`;
  assert.equal(res.state,'completed');
  assert.equal(res.actual_input_tokens,210);
  assert.equal(res.actual_output_tokens,22);
  // Exactly-once accounting: a second complete() is a no-op.
  const usage=new PostgresAIUsageRepository(db);
  assert.equal(await usage.complete({requestId:row.payload_fingerprint,actualInputTokens:210,actualOutputTokens:22,priceMicrousdPerToken:1,at:new Date()}),false);
  const [month]=await db.client`SELECT cost_microusd FROM ai_usage_periods WHERE scope='global_month'`;
  assert.equal(Number(month.cost_microusd),232);
});

test('D05: conversation call cap denies further model calls and answers with the quota copy',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),support=new ZammadSupportProvider(client,'whatsapp message'),thread=61;
  seedThread(client,thread);
  const ai=new FakeAIAssistProvider();
  // One customer effect per conversation may be in flight: resolve each
  // accepted send before the next can be claimed (existing outbox semantics).
  const settle=(id)=>db.client`UPDATE assistant_outbox SET status='delivered' WHERE id=${id}`;
  const first=await enqueueAI(thread,'pertanyaan pertama');
  await deliverSupportOutbox(db,support,first,undefined,ai);
  await settle(first);
  const second=await enqueueAI(thread,'pertanyaan kedua');
  await deliverSupportOutbox(db,support,second,undefined,ai);
  const secondRow=await outboxRow(second);
  await settle(second);
  const third=await enqueueAI(thread,'pertanyaan ketiga');
  await deliverSupportOutbox(db,support,third,undefined,ai);
  assert.equal(ai.calls,2,'maxCallsPerConversation=2 holds');
  assert.equal(secondRow.status,'accepted');
  const thirdRow=await outboxRow(third);
  assert.equal(thirdRow.status,'cancelled');
  assert.equal(thirdRow.last_error,'ai_conversation_call_cap');
  const fallback=(await db.client`SELECT payload_json FROM assistant_outbox WHERE payload_fingerprint=${thirdRow.payload_fingerprint+':fallback'}`);
  assert.equal(fallback.length,1);
  assert.match(JSON.parse(fallback[0].payload_json).content,/Kuota Tanya AI Yubi/);
});

test('D06: 50 concurrent reservation attempts for one contact never overshoot the cap',{skip:!enabled},async()=>{
  const usage=new PostgresAIUsageRepository(db);
  const contactHash=contactHashFor('zammad','contact-concurrency');
  const results=await Promise.all(Array.from({length:50},(_,i)=>usage.reserve({
    requestId:`conc-${i}`,contactHash,providerThreadId:'thread-conc',model:'fake',priceVersion:'test-v1',
    estimatedInputTokens:800,limits:POLICY.limits,at:new Date(),
  })));
  const reserved=results.filter(r=>r.ok&&r.reserved).length;
  assert.equal(reserved,1,'one in-flight generation per contact');
  const denied=results.filter(r=>r.ok&&!r.reserved);
  assert.equal(denied.length,49);
  assert.equal(denied.every(r=>r.reason==='concurrent_request'),true);
  const [rows]=await db.client`SELECT count(*)::int AS n FROM ai_usage_reservations WHERE contact_hash=${contactHash}`;
  assert.equal(rows.n,1);
});

test('D17: the global daily token cap denies before any provider call',{skip:!enabled},async()=>{
  // Earlier tests in this file already consumed conservative global-day budget
  // (reserved amounts count against caps by design): size the tight cap to
  // allow exactly ONE more reservation from the current base.
  const [base]=await db.client`SELECT coalesce(sum(reserved_tokens),0)::int AS used FROM ai_usage_periods WHERE scope='global_day'`;
  const tight={mode:'live',limits:{...POLICY.limits,globalDayTokens:base.used+1750}};
  await config.set('ai_policy',tight,'test',new Date().toISOString());
  try {
    const client=new FakeZammadClient(),support=new ZammadSupportProvider(client,'whatsapp message');
    const ai=new FakeAIAssistProvider();
    const usage=new PostgresAIUsageRepository(db);
    // One full reservation (1500+250) fits; a second (different contact, same day) must not.
    const first=await usage.reserve({requestId:'global-1',contactHash:contactHashFor('zammad','ga'),providerThreadId:'t-a',model:'fake',priceVersion:'test-v1',estimatedInputTokens:800,limits:tight.limits,at:new Date()});
    assert.equal(first.ok&&first.reserved,true);
    const second=await usage.reserve({requestId:'global-2',contactHash:contactHashFor('zammad','gb'),providerThreadId:'t-b',model:'fake',priceVersion:'test-v1',estimatedInputTokens:800,limits:tight.limits,at:new Date()});
    assert.equal(second.ok&&second.reserved,false);
    assert.equal(second.ok&&second.reason,'global_day_tokens');
    // And through the delivery path the denial never reaches the provider.
    const thread=62;seedThread(client,thread);
    const id=await enqueueAI(thread,'apa pun');
    await deliverSupportOutbox(db,support,id,undefined,ai);
    assert.equal(ai.calls,0);
    const row=await outboxRow(id);
    assert.equal(row.last_error,'ai_global_day_tokens');
  } finally {
    await config.set('ai_policy',POLICY,'test',new Date().toISOString());
  }
});

test('D08: provider timeout fails the reservation and answers with the deterministic fallback',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),support=new ZammadSupportProvider(client,'whatsapp message'),thread=63;
  seedThread(client,thread);
  const ai=new FakeAIAssistProvider([{ok:false,code:'TIMEOUT'}]);
  const id=await enqueueAI(thread,'pertanyaan lambat');
  await deliverSupportOutbox(db,support,id,undefined,ai);
  assert.equal(ai.calls,1,'single generation attempt only');
  const row=await outboxRow(id);
  assert.equal(row.status,'cancelled');
  assert.equal(row.last_error,'ai_provider_TIMEOUT');
  const [res]=await db.client`SELECT state,failure_reason FROM ai_usage_reservations WHERE request_id=${row.payload_fingerprint}`;
  assert.equal(res.state,'failed');
  assert.match(res.failure_reason,/provider_TIMEOUT/);
  const articles=client.articlesByTicket.get(String(thread)).filter(a=>a.sender==='Agent');
  assert.equal(articles.length,0,'no AI text and no fallback leak into the thread from this row');
});

test('D08: unsafe model output is rejected before any send',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),support=new ZammadSupportProvider(client,'whatsapp message'),thread=64;
  seedThread(client,thread);
  const ai=new FakeAIAssistProvider([{ok:true,text:'Produk ini sudah halal dan menyembuhkan diabetes, harga Rp 50.000.',usage:{inputTokens:100,outputTokens:30}}]);
  const id=await enqueueAI(thread,'apakah aman?');
  await deliverSupportOutbox(db,support,id,undefined,ai);
  const row=await outboxRow(id);
  assert.equal(row.last_error,'ai_output_rejected');
  assert.equal(client.articlesByTicket.get(String(thread)).filter(a=>a.sender==='Agent').length,0);
  const [res]=await db.client`SELECT state,failure_reason FROM ai_usage_reservations WHERE request_id=${row.payload_fingerprint}`;
  assert.equal(res.state,'failed');
  assert.match(res.failure_reason,/validation_/);
});

test('D20: emergency OFF before dispatch cancels the AI action with zero model calls',{skip:!enabled},async()=>{
  const client=new FakeZammadClient(),support=new ZammadSupportProvider(client,'whatsapp message'),thread=65;
  seedThread(client,thread);
  const ai=new FakeAIAssistProvider();
  const id=await enqueueAI(thread,'pertanyaan terlambat');
  await config.set('mode','off','test',new Date().toISOString());
  try {
    await deliverSupportOutbox(db,support,id,undefined,ai);
    assert.equal(ai.calls,0);
    const row=await outboxRow(id);
    assert.equal(row.status,'cancelled');
    assert.equal(row.last_error,'automation_not_auto');
    assert.equal((await db.client`SELECT count(*)::int AS n FROM ai_usage_reservations WHERE request_id=${row.payload_fingerprint}`)[0].n,0,'no reservation was ever taken for this request');
  } finally {
    await config.set('mode','auto','test',new Date().toISOString());
  }
});
