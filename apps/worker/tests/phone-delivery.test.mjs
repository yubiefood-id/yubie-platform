import test from 'node:test';
import assert from 'node:assert/strict';
import {runPhoneDelivery} from '../dist/phone-delivery-handler.js';
test('disabled OTP and catalog releases cannot touch storage or send SMS',async()=>{
 const database=new Proxy({}, {get(){throw new Error('storage must not be touched');}});
 await runPhoneDelivery(database,{YUBIE_LAUNCH_PROFILE:'DIRECT_COMMERCE_SANDBOX'});
 await runPhoneDelivery(database,{YUBIE_LAUNCH_PROFILE:'PUBLIC_CATALOG_NO_SALES',OTP_PROVIDER:'smsgate'});
 assert.ok(true);
});
