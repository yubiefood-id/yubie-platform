import assert from 'node:assert/strict';import test,{before,after} from 'node:test';
import{randomUUID}from'node:crypto';import{readFile,readdir}from'node:fs/promises';
import{createDatabase,closeDatabase}from'@yubie/persistence';import{OtpCryptography,dispatchPhoneChallenges}from'@yubie/application';
import{handleRequest,setAppContext}from'../dist/index.js';import{createAppContext}from'../dist/composition/create-app.js';
const enabled=!!process.env.DATABASE_URL;let admin,db,name,ctx;
before(async()=>{
 if(!enabled)return;admin=createDatabase(process.env.DATABASE_URL);name='v3_api_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);const u=new URL(process.env.DATABASE_URL);u.pathname='/'+name;db=createDatabase(u.toString());
 for(const f of(await readdir(new URL('../../../packages/persistence/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async s=>s.unsafe(await readFile(new URL('../../../packages/persistence/migrations/'+f,import.meta.url),'utf8')));
 process.env.DATABASE_URL=u.toString();process.env.COMMERCE_PROVIDER='preview';process.env.PURCHASE_OPTIONS_SOURCE='static';process.env.YUBIE_ENV='test';process.env.YUBIE_LAUNCH_PROFILE='DIRECT_COMMERCE_SANDBOX';delete process.env.API_PROXY_TOKEN;
 ctx=createAppContext();ctx.appOrigin='https://local.test';ctx.clock={now:()=> '2026-10-23T12:00:00.000Z'};setAppContext(ctx);
});
after(async()=>{if(ctx?.database)await closeDatabase(ctx.database);if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await closeDatabase(admin);}});
const call=(path,method='GET',data,headers={})=>handleRequest(new Request('https://local.test'+path,{method,headers:{origin:'https://local.test','content-type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})}));


test('public offer never reveals code and claiming uses durable verified identity in payment preview',{skip:!enabled},async()=>{
 const offer=await call('/v1/promotions/welcome');assert.equal(offer.status,200);assert.equal((await offer.json()).data.available,false);
 const bootstrap=await call('/v1/auth/session'),session=await bootstrap.json();const browser=bootstrap.headers.getSetCookie().find(x=>x.startsWith('yubie_browser=')).split(';')[0];const anonymous={cookie:browser,'x-csrf-token':session.data.csrfToken};
 assert.equal((await call('/v1/promotions/welcome/claim','POST',{},anonymous)).status,401);
 const now=ctx.clock.now(),issued=ctx.tokens.issue();await db.client`INSERT INTO users(id,phone,phone_verified_at,created_at,updated_at) VALUES('promo_api_user','+12025550100',${now},${now},${now})`;
 await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES('promo_api_session','promo_api_user',${issued.tokenHash},${now},${new Date(Date.parse(now)+3600_000).toISOString()})`;
 await db.client`UPDATE promotion_campaigns SET status='active',starts_at=${now},ends_at=${new Date(Date.parse(now)+86400_000).toISOString()},approved_at=${now},approved_by='synthetic',approval_ref='synthetic' WHERE id='welcome_v3'`;
 const headers={...anonymous,cookie:browser+'; yubie_session='+issued.token};
 assert.equal((await call('/v1/promotions/welcome/claim','POST',{},headers)).status,403);
 await db.client`INSERT INTO auth_identities(id,user_id,provider,subject,verified_at,created_at) VALUES('promo_api_phone','promo_api_user','phone','+12025550100',${now},${now})`;
 const claimed=await call('/v1/promotions/welcome/claim','POST',{},headers);assert.equal(claimed.status,200);const claim=(await claimed.json()).data;assert.equal(claim.code,'YUBIE15');
 const repeated=await call('/v1/promotions/welcome/claim','POST',{},headers);assert.equal((await repeated.json()).data.entitlementId,claim.entitlementId);assert.equal((await db.client`SELECT id FROM promotion_entitlements`).length,1);
 const publicView=await call('/v1/promotions/welcome');assert.equal((await publicView.json()).data.code,undefined);
 assert.equal((await call('/v1/promotions/welcome/claim','POST',{userId:'other'},headers)).status,400);
 assert.equal((await call('/v1/promotions/welcome/claim','POST',{}, {...headers,origin:'https://attacker.invalid'})).status,403);
 const checkout={lines:[{productId:'flour',sizeId:'250g',quantity:2}],customerEmail:'synthetic@example.invalid',promoCode:'YUBIE15',discountAmount:69999};
 assert.equal((await call('/v1/checkouts','POST',checkout,anonymous)).status,503);
 let sent;ctx.paymentMode='xendit';ctx.tx=ctx.identityTransactions;ctx.paymentProvider={async createPaymentSession(input){sent=input;return{ok:true,value:{providerSessionId:'synthetic_api_session',redirectUrl:'https://payments.invalid/synthetic',rawStatus:'ACTIVE',expiresAt:null}};},async getPaymentSession(){return{ok:true,value:null};},async cancelPaymentSession(){return{ok:true,value:{accepted:false}};}};
 assert.equal((await call('/v1/checkouts','POST',checkout,anonymous)).status,403);assert.equal(sent,undefined);
 const paid=await call('/v1/checkouts','POST',checkout,{...headers,'idempotency-key':randomUUID()});assert.equal(paid.status,201);assert.equal(sent.amount,59500);assert.equal((await paid.json()).data.totalAmount,59500);
 process.env.YUBIE_LAUNCH_PROFILE='PUBLIC_CATALOG_NO_SALES';assert.equal((await call('/v1/promotions/welcome')).status,503);
});
