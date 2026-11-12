import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository} from '@yubie/persistence';
import {FakeOpsAIProvider} from '@yubie/assistant';
import {handleOpsAI} from '../dist/ops-ai.js';

// Operator AI endpoint: disabled by default, budgeted, audited, redacted, and
// never able to send anything (model has no tools; responses are DRAFT-only).
const enabled=!!process.env.DATABASE_URL;
const OPS_POLICY={mode:'live',limits:{
  maxCallsPerConversation:5,maxCallsPerContactDay:20,maxInputTokens:4000,maxOutputTokens:800,
  timeoutMs:15000,contextTurns:4,globalDayTokens:1_000_000,globalMonthCostMicrousd:100_000_000,
  priceMicrousdPerToken:1,priceVersion:'ops-test-v1',
}};
let db,admin,name;
const old={YUBIE_ENV:process.env.YUBIE_ENV,OPS_API_TOKEN:process.env.OPS_API_TOKEN};
test.before(async()=>{
  if(!enabled)return;
  name='yubi_opsai_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=createDatabase(url.toString());
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  process.env.YUBIE_ENV='test';process.env.OPS_API_TOKEN='synthetic-ops-ai';
});
test.after(async()=>{
  if(!enabled)return;
  for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  if(db)await closeDatabase(db);
  if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}
});
const headers={authorization:'Bearer synthetic-ops-ai','content-type':'application/json'};
const post=(body,provider)=>handleOpsAI(new Request('http://local/ops/ai/assist',{method:'POST',headers,body:JSON.stringify(body)}),db,provider);
const get=()=>handleOpsAI(new Request('http://local/ops/ai/status',{headers}),db);

test('unauthenticated and disabled states fail closed',{skip:!enabled},async()=>{
  assert.equal((await handleOpsAI(new Request('http://local/ops/ai/status'),db)).status,401);
  const disabled=await post({action:'runbook_qa',question:'emergency off?',operator:'owner'});
  assert.equal(disabled.status,503);
  assert.equal((await disabled.json()).error,'ops_ai_disabled');
  // Switch on but no live policy: still disabled (fail-closed composition).
  const config=new PostgresRuntimeConfigRepository(db);
  await config.set('ops_ai_enabled',true,'test',new Date().toISOString());
  assert.equal((await post({action:'runbook_qa',question:'jam operasional?',operator:'owner'})).status,503);
  // With policy on but the throwing default provider: explicit not-configured.
  await config.set('ops_ai_policy',OPS_POLICY,'test',new Date().toISOString());
  assert.equal((await post({action:'runbook_qa',question:'jam operasional?',operator:'owner'})).status,503);
  assert.equal((await (await post({action:'runbook_qa',question:'jam operasional?',operator:'owner'})).json()).error,'ops_ai_provider_not_configured');
});

test('runbook_qa happy path: draft response, budget completed, history redacted, audited',{skip:!enabled},async()=>{
  const ai=new FakeOpsAIProvider([{ok:true,text:'Untuk mematikan otomasi pelanggan: POST /ops/assistant/emergency-off. Hubungi 085282141733 bila ragu.',usage:{inputTokens:150,outputTokens:40}}]);
  const response=await post({action:'runbook_qa',question:'bagaimana mematikan bot?',operator:'owner'},ai);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.match(body.draft,/emergency-off/);
  assert.match(body.notice,/DRAFT/i);
  const [reservation]=await db.client`SELECT state FROM ai_usage_reservations WHERE model='fake'`;
  assert.equal(reservation.state,'completed');
  const [call]=await db.client`SELECT operator,action,response_redacted FROM ops_ai_calls`;
  assert.equal(call.operator,'owner');
  assert.equal(call.action,'runbook_qa');
  assert.ok(!call.response_redacted.includes('085282141733'),'phone redacted in stored history');
  assert.ok(call.response_redacted.includes('[telepon]'));
  const [audit]=await db.client`SELECT actor,action FROM audit_events WHERE action='ops_ai.runbook_qa'`;
  assert.equal(audit.actor,'operator:owner');
});

test('customer-bound drafts pass the hard claim validator and are rejected with the reservation failed',{skip:!enabled},async()=>{
  const ai=new FakeOpsAIProvider([{ok:true,text:'Promo khusus: harga Rp 50.000 per pack hari ini!',usage:{inputTokens:100,outputTokens:30}}]);
  const response=await post({action:'draft_b2b_template',context:'Follow up lead distributor Bandung, minat tepung ubi untuk retail.',operator:'owner'},ai);
  assert.equal(response.status,422);
  assert.equal((await response.json()).reason,'price_or_payment_amount');
  const [reservation]=await db.client`SELECT state,failure_reason FROM ai_usage_reservations WHERE failure_reason LIKE 'validation_%'`;
  assert.equal(reservation.state,'failed');
});

test('per-operator budget caps deny further calls with a clear reason',{skip:!enabled},async()=>{
  const config=new PostgresRuntimeConfigRepository(db);
  await config.set('ops_ai_policy',{...OPS_POLICY,limits:{...OPS_POLICY.limits,maxCallsPerConversation:1}},'test',new Date().toISOString());
  const ai=new FakeOpsAIProvider();
  const ok=await post({action:'runbook_qa',question:'satu?',operator:'captest'},ai);
  assert.equal(ok.status,200);
  const denied=await post({action:'runbook_qa',question:'dua?',operator:'captest'},ai);
  assert.equal(denied.status,429);
  assert.equal((await denied.json()).error,'ops_ai_denied_conversation_call_cap');
  await config.set('ops_ai_policy',OPS_POLICY,'test',new Date().toISOString());
});

test('status endpoint reports policy, provider and customer-AI determinism',{skip:!enabled},async()=>{
  const response=await get();
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.enabled,true);
  assert.equal(body.policyMode,'live');
  assert.equal(body.customerAI.enabled,false);
  assert.match(body.customerAI.note,/deterministic/);
});

test('thread actions hit the least-privilege Zammad path and 404 on unknown threads',{skip:!enabled},async()=>{
  const ai=new FakeOpsAIProvider();
  const response=await post({action:'summarize_thread',provider:'zammad',threadId:'99999',operator:'owner'},ai);
  assert.equal(response.status,404);
  assert.equal(ai.calls,0,'no model call for an unknown thread');
});
