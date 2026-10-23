import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';

test('preview/static composition retains durable identity independently from payments',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import {createAppContext} from './dist/composition/create-app.js';
 const ctx=createAppContext();
 assert.equal(ctx.users.constructor.name,'PostgresUserRepository');
 assert.equal(ctx.authSessions.constructor.name,'PostgresSessionRepository');
 `;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),env:{...process.env,YUBIE_ENV:'test',COMMERCE_PROVIDER:'preview',PURCHASE_OPTIONS_SOURCE:'static',DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/unavailable'},encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
});

test('missing database exposes unavailable identity storage, never a temporary customer account',()=>{
 const script=`import assert from 'node:assert/strict';import{createAppContext}from'./dist/composition/create-app.js';const c=createAppContext();const r=await c.users.findById('synthetic');assert.equal(r.ok,false);assert.equal(r.error.code,'unavailable');`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),env:{...process.env,YUBIE_ENV:'test',COMMERCE_PROVIDER:'preview',PURCHASE_OPTIONS_SOURCE:'static',DATABASE_URL:''},encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
