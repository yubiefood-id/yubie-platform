import assert from 'node:assert/strict';
import test from 'node:test';
import * as runtime from '../dist/runtime.js';
const env={ADMIN_ORIGIN:'https://localhost:4174',DATABASE_URL:'postgres://TEST_ONLY',ADMIN_GOOGLE_CLIENT_ID:'TEST_ONLY_STAFF',ADMIN_SESSION_SECRET:'TEST_ONLY_SESSION_SECRET_NOT_REAL_12345',ADMIN_TLS_CERT_FILE:'/run/secrets/admin.crt',ADMIN_TLS_KEY_FILE:'/run/secrets/admin.key'};
test('private admin uses database grants and requires explicit write and admission posture',()=>{
 const config=runtime.adminRuntimeConfig(env);assert.equal(config.writesEnabled,false);assert.equal(config.checkoutAdmission,'unknown');assert.equal(config.host,'127.0.0.1');
 assert.throws(()=>runtime.adminRuntimeConfig({...env,ADMIN_WRITES_ENABLED:'true'}),/admission/i);
 assert.equal(runtime.adminRuntimeConfig({...env,ADMIN_WRITES_ENABLED:'true',YUBIE_CHECKOUT_ADMISSION:'disabled'}).writesEnabled,true);
});
test('private production requires direct HTTPS TLS and a separate staff OAuth client',()=>{
 assert.throws(()=>runtime.adminRuntimeConfig({...env,YUBIE_ENV:'production',ADMIN_TLS_KEY_FILE:''}),/TLS/i);
 assert.throws(()=>runtime.adminRuntimeConfig({...env,GOOGLE_CLIENT_ID:env.ADMIN_GOOGLE_CLIENT_ID}),/separate/i);
 assert.throws(()=>runtime.adminRuntimeConfig({...env,ADMIN_ORIGIN:'http://localhost:4174'}),/HTTPS/i);
 assert.throws(()=>runtime.adminRuntimeConfig({...env,ADMIN_WRITES_ENABLED:'yes'}),/WRITES/i);
 assert.throws(()=>runtime.adminRuntimeConfig({...env,IPAYMU_API_KEY:'TEST_ONLY_NOT_A_REAL_KEY'}),/provider|secret/i);
});
