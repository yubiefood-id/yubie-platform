import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresAssistantOutboxRepository,PostgresWebhookInboxRepository} from '@yubie/persistence';
import {FakeChatwootClient,ChatwootSupportProvider,FakeZammadClient,ZammadSupportProvider} from '@yubie/integrations';
import {deliverSupportOutbox,reconcileOutbound} from '../dist/reply-delivery-handler.js';
import {processAssistantInbox} from '../dist/assistant-handler.js';

const enabled=!!process.env.DATABASE_URL;
let db,admin,config,name;
before(async()=>{
  if(!enabled)return;
  name='yubi_qa_'+randomUUID().replaceAll('-','');
  admin=createDatabase(process.env.DATABASE_URL);await admin.client.unsafe(`CREATE DATABASE "${name}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;db=createDatabase(url.toString());
  const dir=new URL('../../../packages/persistence/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async sql=>{await sql.unsafe(await readFile(new URL(file,dir),'utf8'));});
  config=new PostgresRuntimeConfigRepository(db);
  await config.set('assistant_enabled',true,'test',new Date().toISOString());
});
after(async()=>{if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await closeDatabase(admin);}});
async function enqueue(actionType,payload,provider='chatwoot',thread=randomUUID()) {
  const repo=new PostgresAssistantOutboxRepository(db);
  const r=await repo.enqueue({provider,providerThreadId:thread,conversationRef:thread,actionType,payloadFingerprint:randomUUID(),payloadJson:JSON.stringify(payload),createdAt:new Date().toISOString()});
  return r.value.id;
}
test('shadow mode cannot dispatch a previously queued customer reply',{skip:!enabled},async()=>{
  await config.set('mode','shadow','test',new Date().toISOString());
  const client=new FakeChatwootClient();const support=new ChatwootSupportProvider(client);
  await deliverSupportOutbox(db,support,await enqueue('reply',{content:'must remain private'}));
  assert.equal(client.messages.length,0);
});
test('food-safety internal routing is delivered even while OFF and human owned',{skip:!enabled},async()=>{
  await config.set('mode','off','test',new Date().toISOString());
  const client=new FakeZammadClient();
  client.tickets.set('10',{id:10,number:'10',title:'synthetic',group_id:2,state_id:2,priority_id:1,owner_id:2,customer_id:5,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  const support=new ZammadSupportProvider(client,'whatsapp message');
  await deliverSupportOutbox(db,support,await enqueue('handoff',{intent:'FOOD_SAFETY',handoffReason:'food_safety'},'zammad','10'));
  assert.equal(client.tickets.get('10').group_id,4);
  assert.equal(client.articles.size,0,'no customer article under OFF/human ownership');
});
test('each distinct inbound menu receives one logical response; concurrent replay is harmless',{skip:!enabled},async()=>{
  await config.set('mode','auto','test',new Date().toISOString());
  await config.set('deterministic_flow_version','deterministic-v2','test',new Date().toISOString());
  const client=new FakeZammadClient();const now=new Date().toISOString();
  client.tickets.set('11',{id:11,number:'11',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:0,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
  const support=new ZammadSupportProvider(client,'whatsapp message');
  for(const articleId of [101,102]) {
    client.articles.set(String(articleId),{id:articleId,ticket_id:11,body:'menu',content_type:'text/plain',internal:false,sender:'Customer',type:'whatsapp message',type_id:1,created_at:now,created_by_id:5,from:'synthetic',to:'synthetic',subject:''});
    const input={provider:'zammad',deliveryId:'test-'+articleId,eventType:'article_created',payloadHash:'test-'+articleId,rawBody:JSON.stringify({ticket_id:11,article_id:articleId,customer_id:5,group_id:1}),conversationRef:'11',messageRef:String(articleId),receivedAt:now};
    const r=await new PostgresWebhookInboxRepository(db).insert(input);
    await Promise.all([processAssistantInbox(db,r.value.id,support),processAssistantInbox(db,r.value.id,support)]);
  }
  const rows=await db.client`SELECT * FROM assistant_outbox WHERE conversation_ref='11'`;
  assert.equal(rows.length,2);
  const states=await db.client`SELECT * FROM conversation_flow_state WHERE provider_thread_id='11'`;
  assert.equal(states[0].flow_version,'deterministic-v2');
});

test('REST acceptance and lost acknowledgment never claim delivery or resend an ambiguous article',{skip:!enabled},async()=>{
  await config.set('mode','auto','test',new Date().toISOString());
  const client=new FakeZammadClient(),now=new Date().toISOString();
  client.tickets.set('12',{id:12,number:'12',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:0,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
  const incoming={id:99,ticket_id:12,sender:'Customer',internal:false,type:'whatsapp message',body:'halo',created_at:now};
  client.articlesByTicket.set('12',[incoming]);
  const create=client.createArticle.bind(client);
  client.createArticle=async input=>{await create(input);throw Error('zammad_timeout');};
  const support=new ZammadSupportProvider(client,'whatsapp message');
  const id=await enqueue('reply',{content:'halo',customerReceivedAt:now},'zammad','12');
  await deliverSupportOutbox(db,support,id);
  let [r]=await db.client`SELECT * FROM assistant_outbox WHERE id=${id}`;
  assert.equal(r.status,'ambiguous');
  await deliverSupportOutbox(db,support,id);assert.equal(client.articles.size,1);
  await db.client`UPDATE assistant_outbox SET next_attempt_at=now() WHERE id=${id}`;
  await reconcileOutbound(db,support);
  [r]=await db.client`SELECT * FROM assistant_outbox WHERE id=${id}`;assert.equal(r.status,'accepted');
  const article=Array.from(client.articles.values())[0];article.preferences.whatsapp={timestamp_delivered:String(Date.now())};
  await db.client`UPDATE assistant_outbox SET next_attempt_at=now() WHERE id=${id}`;
  await reconcileOutbound(db,support);
  [r]=await db.client`SELECT * FROM assistant_outbox WHERE id=${id}`;assert.equal(r.status,'delivered');assert.equal(client.articles.size,1);
});

test('expired lease is held for reconciliation and retry exhaustion stops the sixth dispatch',{skip:!enabled},async()=>{
  await config.set('mode','auto','test',new Date().toISOString());
  const support=new ChatwootSupportProvider(new FakeChatwootClient());
  let attempts=0;support.sendReply=async()=>{attempts++;return {ok:false,code:'RATE_LIMITED'};};
  const id=await enqueue('reply',{content:'retry'});
  for(let i=0;i<6;i++){await db.client`UPDATE assistant_outbox SET next_attempt_at=now() WHERE id=${id}`;await deliverSupportOutbox(db,support,id);}
  const [r]=await db.client`SELECT * FROM assistant_outbox WHERE id=${id}`;
  assert.equal(r.status,'failed');assert.equal(attempts,5);
  const lost=await enqueue('reply',{content:'unknown'});
  await db.client`UPDATE assistant_outbox SET status='delivering',lease_until=now()-interval '1 second' WHERE id=${lost}`;
  await new PostgresAssistantOutboxRepository(db).recoverExpiredClaims();
  const [held]=await db.client`SELECT * FROM assistant_outbox WHERE id=${lost}`;assert.equal(held.status,'ambiguous');
});

test('state and inbox roll back when the outbox cannot commit',{skip:!enabled},async()=>{
  await config.set('mode','auto','test',new Date().toISOString());
  const client=new FakeZammadClient(),now=new Date().toISOString();
  client.tickets.set('13',{id:13,number:'13',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:0,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
  client.articles.set('103',{id:103,ticket_id:13,body:'menu',content_type:'text/plain',internal:false,sender:'Customer',type:'whatsapp message',created_at:now,created_by_id:5});
  const input={provider:'zammad',deliveryId:'rollback',payloadHash:'rollback',eventType:'article_created',rawBody:'{"ticket_id":13,"article_id":103,"customer_id":5,"group_id":1}',conversationRef:'13',messageRef:'103',receivedAt:now};
  const r=await new PostgresWebhookInboxRepository(db).insert(input);
  await db.client.unsafe("CREATE FUNCTION yubi_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.conversation_ref='13' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER yubi_test_fail BEFORE INSERT ON assistant_outbox FOR EACH ROW EXECUTE FUNCTION yubi_test_fail()");
  try {
    await assert.rejects(processAssistantInbox(db,r.value.id,new ZammadSupportProvider(client,'whatsapp message')));
    const states=await db.client`SELECT * FROM conversation_flow_state WHERE provider_thread_id='13'`;assert.equal(states.length,0);
    const runs=await db.client`SELECT * FROM assistant_runs WHERE inbox_event_id=${r.value.id}`;assert.equal(runs.length,0);
    const [inbox]=await db.client`SELECT status FROM webhook_inbox WHERE id=${r.value.id}`;assert.notEqual(inbox.status,'processed');
  } finally {await db.client.unsafe('DROP TRIGGER yubi_test_fail ON assistant_outbox; DROP FUNCTION yubi_test_fail()');}
});
