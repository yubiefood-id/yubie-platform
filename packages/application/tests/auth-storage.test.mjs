import assert from 'node:assert/strict';
import test from 'node:test';
import {googleLogin,resolveSession,logout,CryptoSessionTokenService,FixedClock,SequentialIdGenerator,InMemoryUserRepository,InMemorySessionRepository} from '../dist/index.js';
const failure={ok:false,error:{code:'unavailable',message:'unavailable',retryable:true,requestId:'synthetic'}};
const deps=()=>({users:new InMemoryUserRepository(),sessions:new InMemorySessionRepository(),tokens:new CryptoSessionTokenService(),clock:new FixedClock('2026-01-01T00:00:00Z'),ids:new SequentialIdGenerator(),verifier:{async verify(){return {ok:true,value:{sub:'synthetic-google',email:null,emailVerified:false,name:null,picture:null}};}}});
test('failed identity/session writes never report a successful login',async()=>{
 for(const target of ['users','sessions']){const d=deps();d[target].save=async()=>failure;const r=await googleLogin({credential:'synthetic',csrfToken:'a',csrfCookie:'a'},d);assert.equal(r.ok,false);assert.equal(r.error.code,'unavailable');}
});
test('a database outage never resolves a presented session as anonymous',async()=>{
 const d=deps();d.sessions.findByTokenHash=async()=>failure;
 assert.equal((await resolveSession('presented-token',d)).ok,false);
 assert.equal((await logout('presented-token',d)).ok,false);
});
