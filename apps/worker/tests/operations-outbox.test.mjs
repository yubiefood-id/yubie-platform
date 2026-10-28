import assert from 'node:assert/strict';
import test from 'node:test';
import * as handler from '../dist/operations-outbox-handler.js';
test('ops outbox acknowledges only successful internal work; failures remain retryable',async()=>{
 const completed=[],failed=[],reconciled=[];
 const store={claim:async()=>[{id:'TEST_ONLY_EVENT',eventType:'ops.changed',aggregateId:'TEST_ONLY_ORDER',attempt:1},{id:'TEST_ONLY_RECONCILE',eventType:'ops.payment_reconcile_requested',aggregateId:'TEST_ONLY_PAYMENT',attempt:1}],complete:async event=>completed.push(event.id),retry:async event=>failed.push(event.id)};
 const result=await handler.processOperationsOutbox(store,async id=>{reconciled.push(id);throw new Error('TEST_ONLY_PROVIDER_ERROR');});
 assert.deepEqual(completed,['TEST_ONLY_EVENT']);assert.deepEqual(failed,['TEST_ONLY_RECONCILE']);assert.deepEqual(reconciled,['TEST_ONLY_PAYMENT']);assert.equal(result.failed,1);
});
