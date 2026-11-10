import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresConversationModeRepository} from '@yubie/persistence';
import {handleOpsWhatsApp} from '../dist/ops-whatsapp.js';

test('/ops/whatsapp status and mode reset: bearer-gated, PII-free, audited',{skip:!process.env.DATABASE_URL},async()=>{
  const name='yubi_wa_ops_'+randomUUID().replaceAll('-',''),admin=createDatabase(process.env.DATABASE_URL);
  await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;const db=createDatabase(url.toString());
  const old={YUBIE_ENV:process.env.YUBIE_ENV,OPS_API_TOKEN:process.env.OPS_API_TOKEN};
  try {
    const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
    process.env.YUBIE_ENV='test';process.env.OPS_API_TOKEN='synthetic-wa-ops';
    const headers={authorization:'Bearer synthetic-wa-ops','content-type':'application/json'};
    const get=()=>handleOpsWhatsApp(new Request('http://local/ops/whatsapp/status',{headers}),db);
    const post=(path,body)=>handleOpsWhatsApp(new Request('http://local/ops/whatsapp/'+path,{method:'POST',headers,body:JSON.stringify(body)}),db);

    // Unauthenticated access is rejected before anything else.
    const anon=new Request('http://local/ops/whatsapp/status');
    assert.equal((await handleOpsWhatsApp(anon,db)).status,401);
    // Unknown subpaths are not swallowed.
    assert.equal((await handleOpsWhatsApp(new Request('http://local/ops/whatsapp/nope',{headers}),db)).status,404);

    const status=await get();
    assert.equal(status.status,200);
    const body=await status.json();
    assert.equal(body.botEngine,'deterministic');
    assert.equal(body.runtime.aiAssistEnabled,false,'AI assist is fail-closed by default');
    assert.deepEqual(body.conversationModes,{DETERMINISTIC:0,AI_OPT_IN:0});
    assert.ok(body.priorityTasks && typeof body.priorityTasks.unacknowledged==='number');
    assert.ok(body.queue && typeof body.queue.queueLag==='number');
    assert.ok(!JSON.stringify(body).match(/62\d{8,}/),'no raw phone numbers in status payload');

    // Reset: seed an AI session, then reset as an operator.
    const mode=new PostgresConversationModeRepository(db);
    await mode.transition('zammad','77','AI_OPT_IN','customer_opt_in',new Date().toISOString());
    assert.equal((await post('conversation-mode/reset',{provider:'zammad',threadId:'77',changedBy:'qa-operator'})).status,200);
    const [row]=await db.client`SELECT mode,selected_by FROM conversation_mode_state WHERE provider_thread_id='77'`;
    assert.equal(row.mode,'DETERMINISTIC');
    assert.equal(row.selected_by,'qa-operator');
    const [event]=await db.client`SELECT trigger_kind FROM conversation_mode_events WHERE provider_thread_id='77' ORDER BY created_at DESC LIMIT 1`;
    assert.equal(event.trigger_kind,'operator_reset');
    // Invalid payloads are rejected by the schema.
    assert.equal((await post('conversation-mode/reset',{provider:'zammad',threadId:'abc',changedBy:'qa-operator'})).status,400);
  } finally {
    for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await closeDatabase(db);await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);
  }
});
