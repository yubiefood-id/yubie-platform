import assert from 'node:assert/strict';import test,{before,after} from 'node:test';
import{randomUUID}from'node:crypto';import{readFile,readdir}from'node:fs/promises';
import{createDatabase,closeDatabase}from'@yubie/persistence';import{OtpCryptography,dispatchPhoneChallenges}from'@yubie/application';
import{handleRequest,setAppContext}from'../dist/index.js';import{createAppContext}from'../dist/composition/create-app.js';
const enabled=!!process.env.DATABASE_URL;let admin,db,name,ctx;
before(async()=>{
 if(!enabled)return;admin=createDatabase(process.env.DATABASE_URL);name='v3_api_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);const u=new URL(process.env.DATABASE_URL);u.pathname='/'+name;db=createDatabase(u.toString());
 for(const f of(await readdir(new URL('../../../packages/persistence/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async s=>s.unsafe(await readFile(new URL('../../../packages/persistence/migrations/'+f,import.meta.url),'utf8')));
 process.env.DATABASE_URL=u.toString();process.env.COMMERCE_PROVIDER='preview';process.env.PURCHASE_OPTIONS_SOURCE='static';process.env.YUBIE_ENV='test';process.env.YUBIE_LAUNCH_PROFILE='DIRECT_COMMERCE_SANDBOX';delete process.env.API_PROXY_TOKEN;
 ctx=createAppContext();ctx.appOrigin='https://local.test';ctx.phoneAuth={crypto:new OtpCryptography({hashKey:'synthetic-hash-key-32-characters-only',encryptionKey:Buffer.alloc(32,7).toString('base64')}),allowedCountries:['US'],verifyCaptcha:async token=>token==='synthetic-proof'};setAppContext(ctx);
});
after(async()=>{if(ctx?.database)await closeDatabase(ctx.database);if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await closeDatabase(admin);}});
const call=(path,body,headers={})=>handleRequest(new Request('https://local.test'+path,{...(body?{method:'POST',headers:{'content-type':'application/json',origin:'https://local.test','x-yubie-client-ip':'127.0.0.1',...headers},body:JSON.stringify(body)}:{headers})}));
test('phone endpoints enforce CSRF, persist before202 and issue only verified HttpOnly sessions',{skip:!enabled},async()=>{
 const start={phone:'+12025550100',country:'US',purpose:'login',captchaToken:'synthetic-proof'};
 assert.equal((await call('/v1/auth/phone/challenges',start)).status,403);
 const bootstrap=await call('/v1/auth/session');const session=await bootstrap.json();assert.equal(typeof session.data.csrfToken,'string');
 const cookie=bootstrap.headers.getSetCookie().find(c=>c.startsWith('yubie_browser=')).split(';')[0];
 const headers={cookie,'x-csrf-token':session.data.csrfToken,'idempotency-key':randomUUID()};
 const response=await call('/v1/auth/phone/challenges',start,headers);assert.equal(response.status,202);assert.equal(response.headers.getSetCookie().find(c=>c.startsWith('yubie_browser=')).split(';')[0],cookie);const challenge=(await response.json()).data;assert.equal(challenge.code,undefined);assert.equal((await db.client`SELECT id FROM users`).length,0);
 const verifyCaptcha=ctx.phoneAuth.verifyCaptcha;ctx.phoneAuth.verifyCaptcha=async()=>false;
 const duplicate=await call('/v1/auth/phone/challenges',start,headers);assert.equal(duplicate.status,202);assert.equal((await duplicate.json()).data.id,challenge.id);ctx.phoneAuth.verifyCaptcha=verifyCaptcha;
 let code;await dispatchPhoneChallenges({tx:ctx.identityTransactions,clock:ctx.clock,ids:ctx.ids,tokens:ctx.tokens,...ctx.phoneAuth,delivery:{async send(c){code=c.code;return{status:'delivered'};},async lookup(){return{status:'delivered'};}}});
 const verified=await call('/v1/auth/phone/challenges/'+challenge.id+'/verify',{code},headers);assert.equal(verified.status,200);assert.match(verified.headers.get('set-cookie'),/yubie_session=.*HttpOnly.*Secure/);
 assert.equal((await call('/v1/auth/phone/challenges/'+challenge.id+'/verify',{code},headers)).status,401);
 const limited=await call('/v1/auth/phone/challenges',start,{...headers,'idempotency-key':randomUUID()});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
 const forged=await call('/v1/auth/phone/challenges',start,{...headers,origin:'https://attacker.invalid'});assert.equal(forged.status,403);
 process.env.YUBIE_LAUNCH_PROFILE='PUBLIC_CATALOG_NO_SALES';assert.equal((await call('/v1/auth/phone/challenges',start,headers)).status,503);
});
