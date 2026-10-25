import test from 'node:test';
import assert from 'node:assert/strict';
import * as persistence from '../dist/index.js';
import postgres from 'postgres';
import {readFileSync,readdirSync} from 'node:fs';
test('verified payment notifications have a durable pre-ack inbox',()=>{
 assert.equal(typeof persistence.PostgresPaymentNotificationInbox,'function');
});
test('verified notification survives redelivery and worker restart without raw callback data',{skip:!process.env.DATABASE_URL},async()=>{
 const admin=postgres(process.env.DATABASE_URL,{max:1});const name="notification_"+Date.now();await admin`CREATE DATABASE ${admin(name)}`;
 const url=new URL(process.env.DATABASE_URL);url.pathname="/"+name;const db=persistence.createDatabase(url.toString());
 try{
  for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await db.client.unsafe(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
  const input={referenceId:"co_synthetic",amount:35000,currency:"IDR",trxId:"123",sessionId:"session",payloadHash:"a".repeat(64)};
  const first=new persistence.PostgresPaymentNotificationInbox(db);assert.equal(await first.receive(input),"received");
  const restarted=new persistence.PostgresPaymentNotificationInbox(db);assert.equal(await restarted.receive(input),"duplicate");
  const [job]=await restarted.claim();assert.deepEqual(job.notification,input);assert.equal((await restarted.claim()).length,0);
  await restarted.finish(job.id,false);
  assert.equal((await db.client`SELECT processed_at FROM payment_notification_inbox`)[0].processed_at,null);
  await restarted.finish(job.id,true);assert.equal((await restarted.claim()).length,0);
 }finally{await persistence.closeDatabase(db);await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`;await admin.end();}
});
