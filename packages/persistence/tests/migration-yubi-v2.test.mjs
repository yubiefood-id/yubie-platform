import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';

test('0014 to Yubi V2 upgrade preserves V1 navigation, human ownership and prior receipts',{skip:!process.env.DATABASE_URL},async()=>{
 const admin=postgres(process.env.DATABASE_URL,{max:1}),name='yubi_upgrade_'+randomUUID().replaceAll('-','');await admin`CREATE DATABASE ${admin(name)}`;
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;const db=postgres(url.toString(),{max:1});
 const dir=new URL('../migrations/',import.meta.url),files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
 try {
  for(const file of files.filter(f=>f<'0015'))await db.begin(async tx=>{await tx.unsafe(await readFile(new URL(file,dir),'utf8'));});
  await db`INSERT INTO conversation_sessions(id,chatwoot_conversation_id,chatwoot_contact_id,inbox_id,state,last_activity_at,created_at,updated_at) VALUES('s','synthetic','synthetic','1','HUMAN_ACTIVE',now(),now(),now())`;
  await db`INSERT INTO conversation_flow_state(id,provider,provider_thread_id,flow_version,node_id,last_transition_at,created_at,updated_at) VALUES('f','zammad','synthetic','deterministic-v1','buy',now(),now(),now())`;
  await db`INSERT INTO assistant_outbox(id,conversation_ref,action_type,payload_fingerprint,payload_json,status,created_at,updated_at) VALUES('o','synthetic','reply','synthetic','{}','delivered',now(),now())`;
  for(const file of files.filter(f=>f>='0015'))await db.begin(async tx=>{await tx.unsafe(await readFile(new URL(file,dir),'utf8'));});
  assert.equal((await db`SELECT state FROM conversation_sessions WHERE id='s'`)[0].state,'HUMAN_ACTIVE');
  assert.equal((await db`SELECT flow_version FROM conversation_flow_state WHERE id='f'`)[0].flow_version,'deterministic-v1');
  assert.equal((await db`SELECT status FROM assistant_outbox WHERE id='o'`)[0].status,'delivered');
  await db`UPDATE assistant_outbox SET status='accepted' WHERE id='o'`;
  const columns=await db`SELECT column_name FROM information_schema.columns WHERE table_name='conversation_sessions'`;
  assert.ok(columns.some(c=>c.column_name==='bot_released_at'));assert.ok(columns.some(c=>c.column_name==='resolved_at'));
 }finally{await db.end();await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;await admin.end();}
});
