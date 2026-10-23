import assert from 'node:assert/strict';import test from 'node:test';import * as i from '../dist/index.js';
test('Turnstile requires provider success, correct host and phone-auth action; outages fail closed',async()=>{
 assert.equal(typeof i.TurnstileVerifier,'function');
 for(const [payload,want] of [[{success:true,hostname:'yubiefood.com',action:'phone_auth'},true],[{success:true,hostname:'attacker.invalid',action:'phone_auth'},false],[{success:true,hostname:'yubiefood.com',action:'other'},false],[{success:false},false]]){
  const v=new i.TurnstileVerifier('synthetic','yubiefood.com',async()=>new Response(JSON.stringify(payload)));assert.equal(await v.verify('synthetic-proof','127.0.0.1'),want);
 }
 const v=new i.TurnstileVerifier('synthetic','yubiefood.com',async()=>{throw Error('unavailable');});assert.equal(await v.verify('synthetic-proof','127.0.0.1'),false);
});
