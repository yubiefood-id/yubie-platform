import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

test('PostgreSQL outage returns retryable 503 without acknowledging the webhook',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import {createHmac} from 'node:crypto';
 import {handleRequest,shutdownBotRuntime} from './dist/index.js';
 const body=JSON.stringify({event:'article_created',ticket_id:1,article_id:2});
 try {
  const response=await handleRequest(new Request('http://local/webhooks/zammad',{method:'POST',headers:{'x-hub-signature':'sha1='+createHmac('sha1','synthetic-outage').update(body).digest('hex')},body}));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'database_unavailable');
 }finally{await shutdownBotRuntime();}
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),env:{...process.env,YUBIE_ENV:'test',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/unavailable',ZAMMAD_WEBHOOK_SECRET:'synthetic-outage',ZAMMAD_WEBHOOK_BEARER:''},timeout:20000,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
