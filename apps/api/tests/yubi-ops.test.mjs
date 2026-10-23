import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository} from '@yubie/persistence';
import {handleOpsAssistant} from '../dist/ops-assistant.js';

test('flow selection cannot inherit AUTO and all config/audit writes roll back on failure',{skip:!process.env.DATABASE_URL},async()=>{
 const name='yubi_ops_'+randomUUID().replaceAll('-',''),admin=createDatabase(process.env.DATABASE_URL);
 await admin.client.unsafe(`CREATE DATABASE "${name}"`);
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;const db=createDatabase(url.toString());
 const old={YUBIE_ENV:process.env.YUBIE_ENV,OPS_API_TOKEN:process.env.OPS_API_TOKEN,RELEASE_SHA:process.env.RELEASE_SHA};
 try {
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  const config=new PostgresRuntimeConfigRepository(db),now=new Date().toISOString();
  await config.set('mode','auto','test',now);
  process.env.YUBIE_ENV='production';process.env.OPS_API_TOKEN='synthetic-ops-test';process.env.RELEASE_SHA='a'.repeat(40);
  const post=(path,body)=>handleOpsAssistant(new Request('http://local/ops/assistant/'+path,{method:'POST',headers:{authorization:'Bearer synthetic-ops-test','content-type':'application/json'},body:JSON.stringify(body)}),db);
  const selection={flowVersion:'deterministic-v2',changedBy:'qa-operator',releaseSha:'a'.repeat(40),approvalRef:'SYNTHETIC_TEST_ONLY'};
  assert.equal((await post('flow-version',selection)).status,200);assert.equal((await config.getSnapshot()).mode,'shadow');
  assert.equal((await post('mode',{mode:'auto',changedBy:'qa-operator'})).status,409,'no live/media acceptance');
  await db.client.unsafe("CREATE FUNCTION yubi_cfg_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key='flow_selection_approval' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER yubi_cfg_fail BEFORE UPDATE ON assistant_runtime_config FOR EACH ROW EXECUTE FUNCTION yubi_cfg_fail()");
  const before=await db.client`SELECT count(*)::int AS n FROM assistant_runtime_config_audit`;
  await assert.rejects(post('flow-version',{...selection,flowVersion:'deterministic-v1'}));
  assert.equal((await config.getSnapshot()).flowVersion,'deterministic-v2');assert.deepEqual(await db.client`SELECT count(*)::int AS n FROM assistant_runtime_config_audit`,before);
  await db.client.unsafe('DROP TRIGGER yubi_cfg_fail ON assistant_runtime_config; DROP FUNCTION yubi_cfg_fail()');
  assert.equal((await post('emergency-off',{changedBy:'qa-operator'})).status,200);
  const snapshot=await config.getSnapshot();assert.equal(snapshot.mode,'off');assert.equal(snapshot.assistantEnabled,false);
  assert.equal((await post('flow-version',selection)).status,200);assert.equal((await config.getSnapshot()).mode,'off');
 }finally{
  for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await closeDatabase(db);await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);
 }
});
