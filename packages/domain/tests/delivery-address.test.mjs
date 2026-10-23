import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../dist/index.js';
const input={label:'Rumah',recipientName:'Synthetic',recipientPhone:'081234567890',fullAddress:'Alamat sintetis untuk pengujian',province:'Jawa Barat',city:'Bandung',district:'Coblong',subdistrict:'Dago',postalCode:'40135',building:'Unit uji',rt:'01',rw:'02',notes:'',countryCode:'ID'};
test('delivery address normalizes phone without equating it to login identity',()=>{
 const value=domain.normalizeDeliveryAddress(input);assert.ok(value);assert.equal(value.recipientPhone,'+6281234567890');assert.equal(value.countryCode,'ID');assert.equal(domain.normalizeDeliveryAddress({...input,countryCode:'SG'}),null);assert.equal(domain.normalizeDeliveryAddress({...input,recipientPhone:'invalid'}),null);
});
test('manual address works without pin; any pin must be finite and explicitly confirmed',()=>{
 assert.ok(domain.normalizeDeliveryAddress(input));
 for(const pin of [{latitude:NaN,longitude:107,source:'device',confirmed:true},{latitude:-6,longitude:107,source:'device',confirmed:false},{latitude:91,longitude:107,source:'google',confirmed:true}])assert.equal(domain.normalizeDeliveryAddress({...input,pin}),null);
 assert.ok(domain.normalizeDeliveryAddress({...input,pin:{latitude:-6.9,longitude:107.6,source:'device',confirmed:true,accuracyMeters:40}}));
});
