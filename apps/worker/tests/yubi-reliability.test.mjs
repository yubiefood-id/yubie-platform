import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {createDatabase,closeDatabase,PostgresRuntimeConfigRepository,PostgresAssistantOutboxRepository,PostgresWebhookInboxRepository} from '@yubie/persistence';
import {FakeChatwootClient,ChatwootSupportProvider,FakeZammadClient,ZammadSupportProvider} from '@yubie/integrations';
import {deliverSupportOutbox,reconcileOutbound,processPendingOutbox} from '../dist/reply-delivery-handler.js';
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
  await config.set('deterministic_flow_version','deterministic-v2','test',new Date().toISOString());
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

test('queued routine handoff cannot move a newly human-owned ticket',{skip:!enabled},async()=>{
 await config.set('mode','auto','test',new Date().toISOString());
 const client=new FakeZammadClient(),now=new Date().toISOString();
 client.tickets.set('14',{id:14,number:'14',title:'synthetic',group_id:2,state_id:2,priority_id:1,owner_id:9,customer_id:5,created_at:now,updated_at:now});
 const id=await enqueue('handoff',{intent:'B2B_INTRO',handoffReason:'b2b'},'zammad','14');
 await deliverSupportOutbox(db,new ZammadSupportProvider(client,'whatsapp message'),id);
 assert.equal(client.tickets.get('14').group_id,2);assert.equal(client.tags.size,0);
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


test('sweeps lease only the item being dispatched, and safety converges after a lost routing acknowledgment',{skip:!enabled},async()=>{
 await config.set('mode','auto','test',new Date().toISOString());
 const support=new ChatwootSupportProvider(new FakeChatwootClient());
 const ids=await Promise.all([enqueue('reply',{content:'one'}),enqueue('reply',{content:'two'})]);
 let calls=0;const leasedCounts=[];
 support.sendReply=async()=>{calls++;const leased=await db.client`SELECT id FROM assistant_outbox WHERE id IN ${db.client(ids)} AND status='delivering'`;leasedCounts.push(leased.length);return {ok:true,code:'SUCCESS'};};
 await processPendingOutbox(db,support);assert.equal(calls,2);assert.deepEqual(leasedCounts,[1,1]);
 await config.set('mode','off','test',new Date().toISOString());
 const client=new FakeZammadClient(),now=new Date().toISOString();
 client.tickets.set('15',{id:15,number:'15',title:'synthetic',group_id:2,state_id:2,priority_id:1,owner_id:9,customer_id:5,created_at:now,updated_at:now});
 const update=client.updateTicket.bind(client);let lost=true;
 client.updateTicket=async(...args)=>{const result=await update(...args);if(lost){lost=false;throw Error('zammad_timeout');}return result;};
 const safetyId=await enqueue('handoff',{intent:'FOOD_SAFETY',handoffReason:'food_safety'},'zammad','15');
 const zammad=new ZammadSupportProvider(client,'whatsapp message');
 await deliverSupportOutbox(db,zammad,safetyId);
 await db.client`UPDATE assistant_outbox SET next_attempt_at=now() WHERE id=${safetyId}`;
 await reconcileOutbound(db,zammad);
 const [row]=await db.client`SELECT status FROM assistant_outbox WHERE id=${safetyId}`;
 assert.equal(row.status,'delivered');assert.equal(client.tickets.get('15').group_id,4);assert.ok(client.tags.get('15').has('handoff:food-safety'));assert.equal(client.articles.size,0);
});


test('an earlier failed durable input blocks later navigation, but never blocks safety routing',{skip:!enabled},async()=>{
 await config.set('mode','auto','test',new Date().toISOString());
 const client=new FakeZammadClient(),now=new Date().toISOString();
 client.tickets.set('16',{id:16,number:'16',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
 const inbox=new PostgresWebhookInboxRepository(db),ids=[];
 for(const [id,text] of [[201,'produk'],[202,'2'],[203,'produk berbau busuk']]) {
  client.articles.set(String(id),{id,ticket_id:16,sender:'Customer',type:'whatsapp message',internal:false,body:text,created_at:now,created_by_id:5});
  const r=await inbox.insert({provider:'zammad',deliveryId:'ordered-'+id,payloadHash:'ordered-'+id,eventType:'article_created',conversationRef:'16',messageRef:String(id),receivedAt:now});ids.push(r.value.id);
 }
 const provider=new ZammadSupportProvider(client,'whatsapp message');
 const read=provider.getArticle.bind(provider);provider.getArticle=async(ref,id)=>{if(id==='201')throw Error('synthetic_transient');return read(ref,id);};
 await assert.rejects(processAssistantInbox(db,ids[0],provider));
 await assert.rejects(processAssistantInbox(db,ids[1],provider));
 const [second]=await db.client`SELECT status FROM webhook_inbox WHERE id=${ids[1]}`;assert.notEqual(second.status,'processed');
 await processAssistantInbox(db,ids[2],provider);
 const safety=await db.client`SELECT * FROM assistant_outbox WHERE conversation_ref='16' AND action_type='handoff'`;assert.equal(safety.length,1);
 provider.getArticle=read;await processAssistantInbox(db,ids[1],provider);
 const [first]=await db.client`SELECT status FROM webhook_inbox WHERE id=${ids[0]}`;assert.equal(first.status,'processed');
});


test('late human/health requests keep priority, and poison inputs enter bounded internal recovery',{skip:!enabled},async()=>{
 await config.set('mode','auto','test',new Date().toISOString());
 const client=new FakeZammadClient(),now=new Date().toISOString(),provider=new ZammadSupportProvider(client,'whatsapp message'),repo=new PostgresWebhookInboxRepository(db);
 async function input(thread,id,text) {
  client.tickets.set(thread,{id:Number(thread),number:thread,title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
  client.articles.set(String(id),{id,ticket_id:Number(thread),sender:'Customer',type:'whatsapp message',internal:false,body:text,created_at:now,created_by_id:5});
  return (await repo.insert({provider:'zammad',deliveryId:'late-'+id,payloadHash:'late-'+id,eventType:'article_created',conversationRef:thread,messageRef:String(id),receivedAt:now})).value.id;
 }
 for(const [thread,text] of [['17','0'],['18','diabetes']]) {
  const base=Number(thread)*100;
  await processAssistantInbox(db,await input(thread,base+2,'menu'),provider);
  await processAssistantInbox(db,await input(thread,base+1,text),provider);
  const rows=await db.client`SELECT * FROM assistant_outbox WHERE conversation_ref=${thread} AND action_type='handoff'`;assert.equal(rows.length,1,text);
 }
 const poison=await input('19',1901,'menu');await db.client`UPDATE webhook_inbox SET status='failed',attempt_count=5 WHERE id=${poison}`;
 const next=await input('19',1902,'produk');let poisonReads=0;
 const read=provider.getArticle.bind(provider);provider.getArticle=async(ref,id)=>{if(id==='1901'){poisonReads++;throw Error('poison');}return read(ref,id);};
 await processAssistantInbox(db,next,provider);assert.equal(poisonReads,0);
 const [old]=await db.client`SELECT status,attempt_count FROM webhook_inbox WHERE id=${poison}`;assert.equal(old.status,'failed');assert.equal(old.attempt_count,5);
 const [current]=await db.client`SELECT status,attempt_count FROM webhook_inbox WHERE id=${next}`;assert.equal(current.status,'processed');assert.equal(current.attempt_count,0);
 assert.equal((await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref='19' AND action_type='handoff'`).length,1);
});

test('a signed closure event latches RESOLVED even if the provider reopened before processing',{skip:!enabled},async()=>{
 await config.set('mode','auto','test',new Date().toISOString());
 const client=new FakeZammadClient(),now=new Date().toISOString(),repo=new PostgresWebhookInboxRepository(db),provider=new ZammadSupportProvider(client,'whatsapp message');
 client.tickets.set('20',{id:20,number:'20',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
 client.articles.set('2001',{id:2001,ticket_id:20,sender:'Customer',type:'whatsapp message',internal:false,body:'menu',created_at:now,created_by_id:5});
 const event=async(id,extra={})=>(await repo.insert({provider:'zammad',deliveryId:'closure-'+id,payloadHash:'closure-'+id,eventType:'ticket_updated',rawBody:JSON.stringify({ticket_id:20,...extra}),conversationRef:'20',...(extra.article_id?{messageRef:String(extra.article_id)}:{}),receivedAt:now})).value.id;
 await processAssistantInbox(db,await event('initial',{article_id:2001}),provider);
 const closedId=await event('closed',{state_id:4});
 client.articles.set('2002',{id:2002,ticket_id:20,sender:'Customer',type:'whatsapp message',internal:false,body:'menu',created_at:now,created_by_id:5});
 await processAssistantInbox(db,await event('reopened',{article_id:2002,state_id:1}),provider);
 await processAssistantInbox(db,closedId,provider);
 const [session]=await db.client`SELECT state,resolved_at FROM conversation_sessions WHERE provider_thread_id='20'`;assert.equal(session.state,'RESOLVED');assert.ok(session.resolved_at);
 assert.equal((await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref='20' AND action_type='reply'`).length,1);
});


test('concurrent fifth failure is accounted inside the conversation lock',{skip:!enabled},async()=>{
 const client=new FakeZammadClient(),now=new Date().toISOString(),provider=new ZammadSupportProvider(client,'whatsapp message');
 client.tickets.set('21',{id:21,number:'21',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
 const r=await new PostgresWebhookInboxRepository(db).insert({provider:'zammad',deliveryId:'fifth',payloadHash:'fifth',eventType:'article_created',conversationRef:'21',messageRef:'2101',receivedAt:now});
 await db.client`UPDATE webhook_inbox SET status='failed',attempt_count=4 WHERE id=${r.value.id}`;
 let reads=0;provider.getArticle=async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,15));throw Error('synthetic_failure');};
 await Promise.allSettled([processAssistantInbox(db,r.value.id,provider),processAssistantInbox(db,r.value.id,provider)]);
 assert.equal(reads,1);const [row]=await db.client`SELECT attempt_count FROM webhook_inbox WHERE id=${r.value.id}`;assert.equal(row.attempt_count,5);assert.equal((await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref='21' AND action_type='handoff'`).length,1);
});


test('definitive rejected media enqueues exactly one text fallback; replay cannot duplicate it',{skip:!enabled},async()=>{
 await config.set('mode','auto','test',new Date().toISOString());
 const client=new FakeZammadClient(),now=new Date().toISOString(),support=new ZammadSupportProvider(client,'whatsapp message');
 client.tickets.set('22',{id:22,number:'22',title:'synthetic',group_id:1,state_id:1,priority_id:1,owner_id:1,customer_id:5,created_at:now,updated_at:now,yubie_bot_mode:'AUTO'});
 client.articlesByTicket.set('22',[{id:2200,ticket_id:22,sender:'Customer',type:'whatsapp message',internal:false,body:'halo',created_at:now}]);
 const id=await enqueue('product_media',{productId:'shake',assetId:'missing-approved-photo',caption:'synthetic',websiteUrl:'https://yubiefood.com/products/yubie-shake',fallbackText:'Foto belum tersedia. https://yubiefood.com/products/yubie-shake',customerReceivedAt:now},'zammad','22');
 await deliverSupportOutbox(db,support,id);await deliverSupportOutbox(db,support,id);
 const rows=await db.client`SELECT id FROM assistant_outbox WHERE conversation_ref='22' AND action_type='reply'`;assert.equal(rows.length,1);
 await deliverSupportOutbox(db,support,rows[0].id);assert.equal(client.articles.size,1);assert.match([...client.articles.values()][0].body,/https:\/\/yubiefood.com\/products\/yubie-shake/);
});
