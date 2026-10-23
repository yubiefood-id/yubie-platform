import test from 'node:test';import assert from 'node:assert/strict';
import {issueCustomerPinToken,verifyCustomerPin} from '../dist/customer-security.js';
test('country-selection proof is bound to point and browser, expires, and cannot be forged',()=>{
 let now=Date.parse('2026-10-23T12:00:00Z');const ctx={clock:{now:()=>new Date(now).toISOString()}};
 const point={latitude:-6.9,longitude:107.6,source:'device',confirmed:true};const browser='synthetic-browser-binding';
 const validationToken=issueCustomerPinToken(point,browser,ctx);
 assert.equal(verifyCustomerPin({...point,validationToken},browser,ctx),true);
 assert.equal(verifyCustomerPin({...point,validationToken},'other-browser',ctx),false);
 assert.equal(verifyCustomerPin({...point,latitude:40,validationToken},browser,ctx),false);
 assert.equal(verifyCustomerPin({...point,validationToken:validationToken+'x'},browser,ctx),false);
 now+=300_001;assert.equal(verifyCustomerPin({...point,validationToken},browser,ctx),false);
});
