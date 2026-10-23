import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {readdir,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createDatabase,closeDatabase,PostgresWebhookInboxRepository,PostgresAssistantOutboxRepository,PostgresConversationSessionRepository} from '../dist/index.js';
let testUrl,admin,dbName;
before(async()=>{
 if(!process.env.DATABASE_URL)return;
 admin=createDatabase(process.env.DATABASE_URL);dbName='yubi_concurrency_'+randomUUID().replaceAll('-','');
 await admin.client.unsafe(`CREATE DATABASE "${dbName}"`);
 const url=new URL(process.env.DATABASE_URL);url.pathname='/'+dbName;testUrl=url.toString();
 const db=createDatabase(testUrl),dir=new URL('../migrations/',import.meta.url);
 try{for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});}finally{await closeDatabase(db);}
});
after(async()=>{if(admin){await admin.client.unsafe(`DROP DATABASE "${dbName}" WITH (FORCE)`);await closeDatabase(admin);}});
test('concurrent repeated inbox deliveries create exactly one durable event without errors',{skip:!process.env.DATABASE_URL},async()=>{
  const db=createDatabase(testUrl);
  try {
    const repo=new PostgresWebhookInboxRepository(db),key=randomUUID();
    const input={provider:'zammad',deliveryId:key,dedupeKey:key,payloadHash:key,eventType:'article_created',receivedAt:new Date().toISOString()};
    const r=await Promise.all(Array.from({length:8},()=>repo.insert(input)));
    assert.equal(r.filter(x=>x.value.status==='inserted').length,1);
    assert.equal(new Set(r.map(x=>x.value.id)).size,1);
  }finally{await closeDatabase(db);}
});

test('operator reentry release requires a resolved case and cooldown; closure alone does not release',{skip:!process.env.DATABASE_URL},async()=>{
 const db=createDatabase(testUrl);
 try {
  const repo=new PostgresConversationSessionRepository(db),thread=randomUUID(),now=new Date().toISOString();
  await repo.upsert({provider:'fake',providerThreadId:thread,providerCustomerId:'synthetic',providerInboxOrChannelId:'1',inboxId:'1',state:'HUMAN_ACTIVE',lastActivityAt:now,createdAt:now,updatedAt:now});
  assert.equal(await repo.releaseForReentry('fake',thread,now),false);
  await repo.updateState('fake',thread,'RESOLVED',now);assert.equal(await repo.releaseForReentry('fake',thread,now),false);
  const past=new Date(Date.now()-40*60*1000).toISOString();
  await db.client`UPDATE conversation_sessions SET resolved_at=${past} WHERE provider_thread_id=${thread}`;
  assert.equal(await repo.releaseForReentry('fake',thread,now),true);
  const r=await repo.getByProviderThreadId('fake',thread);assert.equal(r.value.state,'RESOLVED');assert.ok(r.value.botReleasedAt);
 }finally{await closeDatabase(db);}
});
test('outbox concurrent claims exclude already leased rows',{skip:!process.env.DATABASE_URL},async()=>{
  const db=createDatabase(testUrl);
  try {
    const repo=new PostgresAssistantOutboxRepository(db),key=randomUUID();
    await repo.enqueue({provider:'fake',conversationRef:key,payloadFingerprint:key,actionType:'reply',payloadJson:'{"content":"hello"}',createdAt:new Date().toISOString()});
    const [a,b]=await Promise.all([repo.claimPending(1000),repo.claimPending(1000)]);
    assert.equal(a.filter(x=>b.some(y=>y.id===x.id)).length,0);
  }finally{await closeDatabase(db);}
});
