import assert from 'node:assert/strict';
import test from 'node:test';
import * as integrations from '../dist/index.js';
const options={baseUrl:'https://private-gateway.invalid',username:'synthetic',password:'synthetic',deviceId:'synthetic-device',simNumber:1};
test('SMS adapter sends a bounded native request with stable ID and keeps delivery separate from acceptance',async()=>{
 assert.equal(typeof integrations.SmsgateOtpDelivery,'function');let captured;
 const adapter=new integrations.SmsgateOtpDelivery({...options,fetchFn:async(url,init)=>{captured={url,init};return new Response(JSON.stringify({id:'otp_synthetic',state:'Pending'}),{status:202});}});
 assert.deepEqual(await adapter.send({id:'otp_synthetic',phone:'+12025550100',code:'012345',ttlSeconds:220}),{status:'accepted'});
 const body=JSON.parse(captured.init.body);assert.equal(captured.url,'https://private-gateway.invalid/3rdparty/v1/messages');assert.equal(body.id,'otp_synthetic');assert.equal(body.ttl,220);assert.equal(body.deviceId,'synthetic-device');assert.match(body.textMessage.text,/012345/);assert.equal(captured.init.redirect,'error');
});
test('SMS transport uncertainty and provider404 never authorize a second message',async()=>{
 const missing=new integrations.SmsgateOtpDelivery({...options,fetchFn:async()=>new Response('{}',{status:404})});
 assert.deepEqual(await missing.lookup('otp_synthetic'),{status:'unknown'});
 const uncertain=new integrations.SmsgateOtpDelivery({...options,fetchFn:async()=>{throw Error('synthetic-secret-never-returned');}});
 await assert.rejects(()=>uncertain.send({id:'otp_synthetic',phone:'+12025550100',code:'012345',ttlSeconds:220}),/SMS_SEND_UNCERTAIN/);
 assert.throws(()=>new integrations.SmsgateOtpDelivery({...options,baseUrl:'http://gateway.invalid'}),/SMSGATE_CONFIG_INVALID/);
});

test('invalid gateway configuration produces only a bounded non-secret error',()=>{
 assert.throws(()=>new integrations.SmsgateOtpDelivery({...options,baseUrl:'secret-bearing invalid URL'}),error=>error.message==='SMSGATE_CONFIG_INVALID'&&!String(error).includes('secret-bearing'));
});
