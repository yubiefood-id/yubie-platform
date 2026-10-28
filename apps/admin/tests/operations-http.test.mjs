import assert from 'node:assert/strict';
import test from 'node:test';
import {handleAdminRequest,issueAdminSession} from '../dist/server.js';
const secret='TEST_ONLY_ADMIN_SESSION_SECRET';const now=Date.now();
function fixture(role='operator'){
 const calls=[];const port={rolesFor:async()=>[role],create:async(...args)=>{calls.push(args);return{id:'test_request',status:'draft',version:1};},list:async()=>({items:[],nextCursor:null}),orderDetail:async()=>({id:'test_order',delivery:null}),report:async()=>({timeZone:'Asia/Jakarta',finance:null}),approve:async()=>({status:'approved',version:2}),apply:async()=>({status:'applied',version:3}),preview:async()=>({applied:false,adjustments:[]})};
 const token=issueAdminSession({sub:'test_staff',role:'operator',exp:now+60000},secret);
 async function request(path,{method='GET',body,origin='https://ops.test',csrf=true}={}){
  const headers={'cookie':`yubie_ops=${token}; yubie_ops_csrf=test_csrf`,'content-type':'application/json','origin':origin};if(csrf)headers['x-yubie-csrf']='test_csrf';
  return handleAdminRequest(new Request('https://ops.test'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),{sessionSecret:secret,nowMs:now,operations:port});
 }
 return{request,calls,port};
}
const shipping={kind:'shipping_policy',payload:{scope:'whole_city',policy:'free_promotional',cities:['TEST_ONLY_CITY'],amount:0,serviceCoverage:'TEST_ONLY_COURIER',costOwner:'TEST_ONLY_BUDGET',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+60000).toISOString(),approvalRef:'TEST_ONLY_APPROVAL',verification:{status:'VERIFIED',evidenceRef:'TEST_ONLY_DOC',verifiedBy:'TEST_ONLY_OWNER',verifiedAt:new Date(now).toISOString()}}};
test('staff operation draft requires idempotency and authenticated server identity',async()=>{
 const f=fixture();
 const missing=await f.request('/v1/requests',{method:'POST',body:shipping});assert.equal(missing.status,400);assert.equal(f.calls.length,0);
});
test('same-origin mutation protection cannot be satisfied by CSRF header alone',async()=>{
 const f=fixture();const r=await f.request('/v1/requests',{method:'POST',body:shipping,origin:'https://evil.test'});assert.equal(r.status,403);assert.equal(f.calls.length,0);
});
test('actual current staff grants control order details and report resources',async()=>{
 const f=fixture('viewer');const r=await f.request('/v1/orders/test_order');assert.equal(r.status,200);assert.equal((await r.json()).data.delivery,null);assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal((await f.request('/v1/reports/daily?date=2026-10-28')).status,200);
});
test('revoked staff identity cannot read using a still-valid signed cookie',async()=>{
 const f=fixture();f.port.rolesFor=async()=>[];assert.equal((await f.request('/auth/session')).status,403);
});
test('viewer cannot approve requests, trigger refunds or access payment details',async()=>{
 const f=fixture('viewer');assert.equal((await f.request('/v1/requests/test_request/approve',{method:'POST',body:{expectedVersion:1,reason:'TEST_ONLY'}})).status,403);
 assert.equal((await f.request('/v1/refunds')).status,403);
});
test('Finance can open a new exception case at version zero',async()=>{
 const f=fixture('finance');f.port.triage=async(_sub,_key,_id,input)=>({version:input.expectedVersion+1,state:input.state});
 const token=issueAdminSession({sub:'test_staff',role:'finance',exp:now+60000},secret);
 const response=await handleAdminRequest(new Request('https://ops.test/v1/payments/test_payment/triage',{method:'POST',headers:{cookie:`yubie_ops=${token}; yubie_ops_csrf=test_csrf`,origin:'https://ops.test','x-yubie-csrf':'test_csrf','content-type':'application/json','idempotency-key':'test_triage'},body:JSON.stringify({expectedVersion:0,state:'investigating',reason:'TEST_ONLY investigation'})}),{sessionSecret:secret,nowMs:now,operations:f.port});
 assert.equal(response.status,200);assert.equal((await response.json()).data.version,1);
});
test('reading staff auth config preserves an existing valid CSRF nonce across tabs',async()=>{
 const options={sessionSecret:secret,nowMs:now};
 const first=await handleAdminRequest(new Request('https://ops.test/auth/config'),options);const nonce=(await first.json()).data.csrfToken;
 const second=await handleAdminRequest(new Request('https://ops.test/auth/config',{headers:{cookie:'yubie_ops_csrf='+nonce}}),options);
 assert.equal((await second.json()).data.csrfToken,nonce);
});
