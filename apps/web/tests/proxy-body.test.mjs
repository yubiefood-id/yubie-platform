import test from 'node:test';import assert from 'node:assert/strict';
import {readProxyBody} from '../lib/api-proxy-body.ts';
test('same-origin proxy bounds streaming customer bodies and cancels oversize input',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(40000));c.enqueue(new Uint8Array(40000));},cancel(){cancelled=true;}});
 const request=new Request('https://local.test/api/account/addresses',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(()=>readProxyBody(request),/BODY_TOO_LARGE/);assert.equal(cancelled,true);
 assert.equal(await readProxyBody(new Request('https://local.test/api/auth/session')),undefined);
 assert.equal(await readProxyBody(new Request('https://local.test/api/account/addresses',{method:'POST',body:'{"label":"Rumah"}'})),'{"label":"Rumah"}');
});
