import test from 'node:test';
import assert from 'node:assert/strict';
import {OtpCryptography} from '../dist/index.js';
test('OTP encrypted payload is randomized and rejects tampered ciphertext, tags and keys',()=>{
 const c=new OtpCryptography({hashKey:'synthetic-key-32-characters-for-test',encryptionKey:Buffer.alloc(32,7).toString('base64')});
 const sealed=c.seal('synthetic payload');assert.equal(c.open(sealed),'synthetic payload');assert.notEqual(sealed,c.seal('synthetic payload'));
 for(const position of [0,12,28]){const bytes=Buffer.from(sealed,'base64url');bytes[position]^=1;assert.throws(()=>c.open(bytes.toString('base64url')));}
 assert.throws(()=>c.open(Buffer.from(sealed,'base64url').subarray(0,20).toString('base64url')));
 const other=new OtpCryptography({hashKey:'synthetic-key-32-characters-for-test',encryptionKey:Buffer.alloc(32,8).toString('base64')});assert.throws(()=>other.open(sealed));
});
