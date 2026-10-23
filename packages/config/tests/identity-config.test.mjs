import assert from 'node:assert/strict';
import test from 'node:test';
import * as config from '../dist/index.js';
const keys={OTP_PROVIDER:'smsgate',DATABASE_URL:'synthetic',OTP_HASH_SECRET:'synthetic-hash-key-32-characters-only',OTP_DELIVERY_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),APP_ORIGIN:'https://yubiefood.com',TURNSTILE_SECRET_KEY:'synthetic'};
test('OTP config defaults disabled and rejects fake providers and partial real configuration',()=>{
 assert.equal(typeof config.parseIdentityRuntimeConfig,'function');assert.equal(config.parseIdentityRuntimeConfig({},'api'),null);
 assert.throws(()=>config.parseIdentityRuntimeConfig({OTP_PROVIDER:'fake'},'api'),/OTP_PROVIDER/);
 assert.throws(()=>config.parseIdentityRuntimeConfig({...keys,DATABASE_URL:''},'api'),/DATABASE_URL/);
 assert.throws(()=>config.parseIdentityRuntimeConfig({...keys,TURNSTILE_SECRET_KEY:''},'api'),/TURNSTILE_SECRET_KEY/);
 const c=config.parseIdentityRuntimeConfig(keys,'api');assert.deepEqual(c.allowedCountries,['ID']);
 assert.throws(()=>config.parseIdentityRuntimeConfig(keys,'worker'),/SMSGATE/);
});
