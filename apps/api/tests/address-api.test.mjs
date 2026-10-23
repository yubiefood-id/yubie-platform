import assert from 'node:assert/strict';import test,{before,after} from 'node:test';
import{randomUUID}from'node:crypto';import{readFile,readdir}from'node:fs/promises';
import{createDatabase,closeDatabase}from'@yubie/persistence';import{OtpCryptography,dispatchPhoneChallenges}from'@yubie/application';
import{handleRequest,setAppContext}from'../dist/index.js';import{createAppContext}from'../dist/composition/create-app.js';
const enabled=!!process.env.DATABASE_URL;let admin,db,name,ctx;
before(async()=>{
 if(!enabled)return;admin=createDatabase(process.env.DATABASE_URL);name='v3_api_'+randomUUID().replaceAll('-','');await admin.client.unsafe(`CREATE DATABASE "${name}"`);const u=new URL(process.env.DATABASE_URL);u.pathname='/'+name;db=createDatabase(u.toString());
 for(const f of(await readdir(new URL('../../../packages/persistence/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.client.begin(async s=>s.unsafe(await readFile(new URL('../../../packages/persistence/migrations/'+f,import.meta.url),'utf8')));
 process.env.DATABASE_URL=u.toString();process.env.COMMERCE_PROVIDER='preview';process.env.PURCHASE_OPTIONS_SOURCE='static';process.env.YUBIE_ENV='test';process.env.YUBIE_LAUNCH_PROFILE='DIRECT_COMMERCE_SANDBOX';delete process.env.API_PROXY_TOKEN;
 ctx=createAppContext();ctx.appOrigin='https://local.test';setAppContext(ctx);
});
after(async()=>{if(ctx?.database)await closeDatabase(ctx.database);if(db)await closeDatabase(db);if(admin){await admin.client.unsafe(`DROP DATABASE "${name}" WITH(FORCE)`);await closeDatabase(admin);}});
const call=(path,method='GET',data,headers={})=>handleRequest(new Request('https://local.test'+path,{method,headers:{origin:'https://local.test','content-type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})}));

test('address APIs require a live customer session and CSRF, hide other owners and reject unconfirmed pins',{skip:!enabled},async()=>{
 assert.equal((await call('/v1/account/addresses')).status,401);
 const issued=ctx.tokens.issue(),now=ctx.clock.now();
 await db.client`INSERT INTO users(id,created_at,updated_at) VALUES('address-api-owner',${now},${now})`;
 await db.client`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES('address-api-session','address-api-owner',${issued.tokenHash},${now},${new Date(Date.now()+3600_000).toISOString()})`;
 const bootstrap=await call('/v1/auth/session');const payload=await bootstrap.json();
 const browser=bootstrap.headers.getSetCookie().find(c=>c.startsWith('yubie_browser=')).split(';')[0];
 const headers={cookie:browser+'; yubie_session='+issued.token,'x-csrf-token':payload.data.csrfToken};
 const input={label:'Rumah',recipientName:'Synthetic',recipientPhone:'081234567890',fullAddress:'Alamat sintetis untuk pengujian',province:'Jawa Barat',city:'Bandung',district:'Coblong',postalCode:'40135'};
 assert.equal((await call('/v1/account/addresses','POST',input,{cookie:headers.cookie})).status,403);
 const created=await call('/v1/account/addresses','POST',input,headers);assert.equal(created.status,201);const address=(await created.json()).data;
 assert.equal((await call('/v1/account/addresses','GET',undefined,headers)).status,200);
 const edited=await call('/v1/account/addresses/'+address.id,'PATCH',{label:'Kantor'},headers);assert.equal(edited.status,200);const changed=(await edited.json()).data;assert.equal(changed.address.district,'Coblong');assert.equal(changed.address.recipientPhone,address.address.recipientPhone);
 assert.equal((await call('/v1/account/addresses/'+address.id,'PATCH',{...input,countryCode:'SG'},headers)).status,400);
 assert.equal((await call('/v1/account/addresses/'+address.id,'PATCH',{...input,pin:{latitude:-6,longitude:107,source:'device',confirmed:false}},headers)).status,400);
 assert.equal((await call('/v1/account/default-address','PUT',{addressId:address.id},headers)).status,200);
 assert.equal((await call('/v1/account/addresses/'+address.id,'DELETE',undefined,headers)).status,200);
 assert.equal((await call('/v1/account/addresses/'+address.id,'PATCH',input,headers)).status,404);
 ctx.deliveryLocations={async autocomplete(){return[{id:'ChIJ_synthetic',label:'Lokasi uji'}];},async details(){return null;},async reverse(){return null;}};
 const located=await call('/v1/locations/autocomplete','POST',{query:'Alamat uji',sessionToken:randomUUID()},{...headers,'x-yubie-client-ip':'127.0.0.1'});assert.equal(located.status,200);assert.equal((await located.json()).data[0].id,'ChIJ_synthetic');
 for(let i=0;i<19;i++)await call('/v1/locations/autocomplete','POST',{query:'Alamat uji',sessionToken:randomUUID()},{...headers,'x-yubie-client-ip':'127.0.0.1'});
 assert.equal((await call('/v1/locations/autocomplete','POST',{query:'Alamat uji',sessionToken:randomUUID()},{...headers,'x-yubie-client-ip':'127.0.0.1'})).status,429);assert.equal((await db.client`SELECT id FROM customer_addresses`).length,0);
 process.env.YUBIE_LAUNCH_PROFILE='PUBLIC_CATALOG_NO_SALES';assert.equal((await call('/v1/locations/autocomplete','POST',{query:'Alamat uji',sessionToken:randomUUID()},headers)).status,503);assert.equal((await call('/v1/account/addresses','GET',undefined,headers)).status,503);
});
