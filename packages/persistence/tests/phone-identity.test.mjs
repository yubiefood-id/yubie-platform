import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import * as p from '../dist/index.js';
import * as a from '@yubie/application';
let db,admin,name,now,deps;
const enabled=!!process.env.DATABASE_URL;
before(async()=>{
 if(!enabled)return;
 admin=p.createDatabase(process.env.DATABASE_URL);name='identity_v3_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);
 const u=new URL(process.env.DATABASE_URL);u.pathname='/'+name;db=p.createDatabase(u.toString());
 const dir=new URL('../migrations/',import.meta.url);for(const f of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async s=>s.unsafe(await readFile(new URL(f,dir),'utf8')));
 now=Date.now();
});
after(async()=>{if(db)await p.closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await p.closeDatabase(admin);}});
function context(){
 assert.equal(typeof a.OtpCryptography,'function');
 return {tx:new p.PostgresTransactionManager(db),clock:{now:()=>new Date(now).toISOString()},ids:{nextId:()=>randomUUID()},tokens:new a.CryptoSessionTokenService(),crypto:new a.OtpCryptography({hashKey:'synthetic-hash-key-32-characters-only',encryptionKey:Buffer.alloc(32,7).toString('base64')}),allowedCountries:['ID','US']};
}
const request=(browser='synthetic-browser-binding-00000001')=>({phone:'081234567890',country:'ID',browser,ip:'synthetic-edge-ip',idempotencyKey:randomUUID(),purpose:'login',captchaVerified:true});
async function delivered(input){
 const r=await a.startPhoneChallenge(input,deps);assert.equal(r.ok,true);
 let code;
 await a.dispatchPhoneChallenges({...deps,delivery:{async send(command){code=command.code;return{status:'accepted'};},async lookup(){return{status:'accepted'};}}});
 assert.equal(typeof code,'string');return {id:r.value.id,code,input};
}
test('verified phone creates one account/session; parallel verification and replay cannot issue another',{skip:!enabled},async()=>{
 deps=context();const input=request();
 const first=await a.startPhoneChallenge(input,deps);assert.equal(first.ok,true);assert.equal((await db.client`SELECT id FROM users`).length,0);
 const replay=await a.startPhoneChallenge(input,deps);assert.equal(replay.value.id,first.value.id);
 let code;await a.dispatchPhoneChallenges({...deps,delivery:{async send(c){code=c.code;return{status:'accepted'};},async lookup(){return{status:'accepted'};}}});
 const results=await Promise.all(Array.from({length:8},()=>a.verifyPhoneChallenge({id:first.value.id,code,browser:input.browser},deps)));
 assert.equal(results.filter(r=>r.ok).length,1);
 assert.equal((await db.client`SELECT id FROM users`).length,1);assert.equal((await db.client`SELECT id FROM auth_sessions`).length,1);
 const user=results.find(r=>r.ok).value.user;assert.equal(user.phone,'+6281234567890');assert.equal(user.email,null);
 assert.equal((await a.verifyPhoneChallenge({id:first.value.id,code,browser:input.browser},deps)).ok,false);
});
test('wrong codes, expiry, browser binding and resend limits are enforced in durable state',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;const c=await delivered(request('synthetic-browser-binding-00000002'));
 assert.equal((await a.verifyPhoneChallenge({id:c.id,code:c.code,browser:'wrong-browser'},deps)).ok,false);
 for(let i=0;i<5;i++)assert.equal((await a.verifyPhoneChallenge({id:c.id,code:c.code==='000000'?'111111':'000000',browser:c.input.browser},deps)).ok,false);
 assert.equal((await a.verifyPhoneChallenge({id:c.id,code:c.code,browser:c.input.browser},deps)).ok,false);
 assert.equal((await a.startPhoneChallenge({...c.input,idempotencyKey:randomUUID()},deps)).error.code,'rate_limited');
 now+=3600_000;const expired=await delivered(request('synthetic-browser-binding-00000003'));now+=301_000;
 assert.equal((await a.verifyPhoneChallenge({id:expired.id,code:expired.code,browser:expired.input.browser},deps)).ok,false);
});
test('an uncertain SMS send is held and reconciled without creating or blindly resending an OTP',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;const c=await a.startPhoneChallenge(request('synthetic-browser-binding-00000004'),deps);assert.equal(c.ok,true);let sends=0;
 const delivery={async send(){sends++;throw Error('synthetic-timeout');},async lookup(){return{status:'unknown'};}};
 await a.dispatchPhoneChallenges({...deps,delivery});now+=31_000;await a.dispatchPhoneChallenges({...deps,delivery});
 assert.equal(sends,1);const [row]=await db.client`SELECT delivery_state FROM phone_verifications WHERE id=${c.value.id}`;assert.equal(row.delivery_state,'ambiguous');
});
test('resend invalidates every previous active challenge for that phone even across browsers',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;
 const old=await delivered(request('synthetic-browser-binding-00000005'));
 now+=61_000;const other={...request('synthetic-browser-binding-00000006'),phone:'+12025550100',country:'US'};await delivered(other);
 now+=61_000;const next=await a.startPhoneChallenge(request('synthetic-browser-binding-00000006'),deps);assert.equal(next.ok,true);
 assert.equal((await a.verifyPhoneChallenge({id:old.id,code:old.code,browser:old.input.browser},deps)).ok,false);
});
test('late send acknowledgment cannot overwrite a newer delivered reconciliation receipt',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;const c=await a.startPhoneChallenge(request('synthetic-browser-binding-00000007'),deps);assert.equal(c.ok,true);
 const entered=Promise.withResolvers();let resolveSend;
 const first=a.dispatchPhoneChallenges({...deps,delivery:{async send(){entered.resolve();return new Promise(r=>{resolveSend=r;});},async lookup(){return{status:'unknown'};}}});
 await entered.promise;now+=31_000;
 await a.dispatchPhoneChallenges({...deps,delivery:{async send(){throw Error('no second send');},async lookup(){return{status:'delivered'};}}});
 resolveSend({status:'accepted'});await first;
 const [row]=await db.client`SELECT delivery_state FROM phone_verifications WHERE id=${c.value.id}`;assert.equal(row.delivery_state,'delivered');
});
test('Google account linking preserves the user, refuses conflicting owners and rotates the proved session',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;const time=new Date(now).toISOString();
 await db.client`INSERT INTO users(id,google_sub,email,name,picture,created_at,updated_at) VALUES('legacy-google-user','legacy-google-sub',NULL,'Synthetic',NULL,${time},${time})`;
 const verifier={async verify(){return{ok:true,value:{sub:'legacy-google-sub',email:null,emailVerified:false,name:'Synthetic',picture:null}};}};
 const login=await a.googleLogin({credential:'synthetic',csrfToken:'a',csrfCookie:'a'},{...deps,verifier,users:new p.PostgresUserRepository(db),sessions:new p.PostgresSessionRepository(db)});assert.equal(login.ok,true);
 assert.equal((await db.client`SELECT id FROM auth_identities WHERE provider='google' AND subject='legacy-google-sub'`).length,1);
 const actor={userId:'legacy-google-user',authenticatedAt:time,sessionHash:deps.tokens.hash(login.value.sessionToken)};
 const occupied=await delivered({...request('synthetic-browser-binding-00000008'),purpose:'link_phone',actor});
 const conflict=await a.verifyPhoneChallenge({id:occupied.id,code:occupied.code,browser:occupied.input.browser,actor},deps);assert.equal(conflict.ok,false);assert.equal(conflict.error.code,'conflict');
 now+=61_000;const free=await delivered({...request('synthetic-browser-binding-00000009'),phone:'+12025550101',country:'US',purpose:'link_phone',actor});
 const linked=await a.verifyPhoneChallenge({id:free.id,code:free.code,browser:free.input.browser,actor},deps);assert.equal(linked.ok,true);assert.equal(linked.value.user.id,'legacy-google-user');
 const [previous]=await db.client`SELECT revoked_at FROM auth_sessions WHERE token_hash=${actor.sessionHash}`;assert.ok(previous.revoked_at);
 const stale=await a.startPhoneChallenge({...request('synthetic-browser-binding-00000010'),phone:'+12025550101',country:'US',purpose:'reauth',actor},deps);assert.equal(stale.ok,false);
});
test('a phone-first customer can add Google with both proofs without changing ownership',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;const c=await delivered(request('synthetic-browser-binding-00000011'));
 const phone=await a.verifyPhoneChallenge({id:c.id,code:c.code,browser:c.input.browser},deps);assert.equal(phone.ok,true);
 const actor={userId:phone.value.user.id,authenticatedAt:new Date(now).toISOString(),sessionHash:deps.tokens.hash(phone.value.sessionToken)};
 const verifier={async verify(){return{ok:true,value:{sub:'phone-added-google',email:null,emailVerified:false,name:'Synthetic',picture:null}};}};
 assert.equal(typeof a.linkGoogleIdentity,'function');
 const auth={...deps,verifier,users:new p.PostgresUserRepository(db),sessions:new p.PostgresSessionRepository(db)};
 const linked=await a.linkGoogleIdentity({credential:'synthetic',csrfToken:'a',csrfCookie:'a',actor},auth);assert.equal(linked.ok,true);assert.equal(linked.value.user.id,actor.userId);
 const google=await a.googleLogin({credential:'synthetic',csrfToken:'a',csrfCookie:'a'},auth);assert.equal(google.ok,true);assert.equal(google.value.user.id,actor.userId);assert.equal(google.value.user.phoneVerified,true);
 const conflict=await a.linkGoogleIdentity({credential:'synthetic',csrfToken:'a',csrfCookie:'a',actor:{...actor,sessionHash:deps.tokens.hash(google.value.sessionToken)}},{...auth,verifier:{async verify(){return{ok:true,value:{sub:'legacy-google-sub',email:null,emailVerified:false,name:null,picture:null}};}}});assert.equal(conflict.ok,false);assert.equal(conflict.error.code,'conflict');
});

test('audit failure rolls back proof consumption, identity and session atomically',{skip:!enabled},async()=>{
 deps=context();now+=3600_000;
 const c=await delivered({...request('synthetic-browser-binding-00000012'),phone:'+12025550102',country:'US'});
 const before=(await db.client`SELECT id FROM auth_sessions`).length;
 await db.client.unsafe("CREATE FUNCTION reject_phone_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='identity.phone_verified' THEN RAISE EXCEPTION 'synthetic audit outage'; END IF; RETURN NEW; END $$");
 await db.client.unsafe("CREATE TRIGGER reject_phone_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_phone_audit()");
 try {
  const failed=await a.verifyPhoneChallenge({id:c.id,code:c.code,browser:c.input.browser},deps);assert.equal(failed.ok,false);assert.equal(failed.error.code,'unavailable');
  assert.equal((await db.client`SELECT id FROM auth_sessions`).length,before);
  assert.equal((await db.client`SELECT state FROM phone_verifications WHERE id=${c.id}`)[0].state,'active');
  assert.equal((await db.client`SELECT id FROM auth_identities WHERE provider='phone' AND subject='+12025550102'`).length,0);
 } finally {await db.client.unsafe('DROP TRIGGER reject_phone_audit ON audit_events');await db.client.unsafe('DROP FUNCTION reject_phone_audit()');}
 assert.equal((await a.verifyPhoneChallenge({id:c.id,code:c.code,browser:c.input.browser},deps)).ok,true);
});
