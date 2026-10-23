import assert from 'node:assert/strict';
import test from 'node:test';
import {handleRequest} from '../dist/index.js';
test('oversize streaming webhook cancels input before buffering the full request',async()=>{
  let pulls=0,cancelled=false;
  const body=new ReadableStream({pull(c){pulls++;if(pulls>100)c.close();else c.enqueue(new Uint8Array(65536));},cancel(){cancelled=true;}});
  const response=await handleRequest(new Request('http://localhost/webhooks/zammad',{method:'POST',body,duplex:'half'}));
  assert.equal(response.status,413);assert.ok(pulls<10);assert.equal(cancelled,true);
});
