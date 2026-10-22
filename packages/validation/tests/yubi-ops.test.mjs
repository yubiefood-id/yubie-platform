import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from '../dist/index.js';
test('operator flow/reentry commands reject injected refs, unknown properties and missing named actor',()=>{
 const good={provider:'zammad',threadId:'12',changedBy:'operator.test'};
 assert.equal(v.yubiReentrySchema.safeParse(good).success,true);
 for(const patch of [{threadId:'../12'},{changedBy:''},{provider:'meta'},{force:true}])assert.equal(v.yubiReentrySchema.safeParse({...good,...patch}).success,false);
 assert.equal(v.yubiFlowVersionSchema.safeParse({flowVersion:'deterministic-v2',releaseSha:'a'.repeat(40),approvalRef:'SYNTHETIC',changedBy:'operator.test'}).success,true);
 assert.equal(v.yubiFlowVersionSchema.safeParse({flowVersion:'legacy',releaseSha:'x'}).success,false);
});
