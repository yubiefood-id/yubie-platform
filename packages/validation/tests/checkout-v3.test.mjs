import test from 'node:test';
import assert from 'node:assert/strict';
import * as validation from '../dist/index.js';
const address={label:'Rumah',recipientName:'Synthetic',recipientPhone:'081234567890',fullAddress:'Alamat sintetis pengujian',province:'Jawa Barat',city:'Bandung',postalCode:'40135'};
const request={checkoutVersion:3,lines:[{productId:'flour',sizeId:'250g',quantity:1}],contact:{phone:'081234567890',country:'ID'},delivery:address};
test('V3 accepts phone-only contact and a manually entered Indonesia address',()=>{
 assert.ok(validation.checkoutV3RequestSchema,'versioned contract exists');
 const parsed=validation.checkoutV3RequestSchema.safeParse(request);assert.equal(parsed.success,true);assert.equal(parsed.data.contact.email,undefined);
 assert.equal(validation.checkoutV3RequestSchema.safeParse({...request,contact:{...request.contact,email:'synthetic@example.invalid'}}).success,true);
});
test('V3 rejects monetary/identity authority, unsupported shipping and malformed contact',()=>{
 const schema=validation.checkoutV3RequestSchema;assert.ok(schema);
 for(const change of [{totalAmount:1},{userId:'other'},{entitlementId:'other'},{delivery:{...address,countryCode:'SG'}},{contact:{phone:''}},{contact:{phone:'081234567890',email:'invalid'}},{lines:[]}])assert.equal(schema.safeParse({...request,...change}).success,false);
});
test('legacy email checkout contract remains unchanged and explicit versions cannot be confused',()=>{
 assert.equal(validation.checkoutRequestSchema.safeParse({lines:request.lines,customerEmail:'synthetic@example.invalid'}).success,true);
 assert.equal(validation.checkoutRequestSchema.safeParse(request).success,false);
 assert.ok(validation.checkoutV3RequestSchema);
 assert.equal(validation.checkoutV3RequestSchema.safeParse({...request,checkoutVersion:1}).success,false);
});
