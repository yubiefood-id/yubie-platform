import assert from 'node:assert/strict';
import test from 'node:test';
import * as config from '../dist/index.js';
const evidence={approvalStatus:'APPROVED',approvalRef:'SYNTHETIC_TEST',sourceSha:'a'.repeat(40),sourceDirty:false,artifactDigest:'sha256:'+'b'.repeat(64),canonicalOrigin:'https://yubiefood.com',launchProfile:'PUBLIC_CATALOG_NO_SALES',paymentMode:'disabled',verifiedRoutes:['/products/yubie-flour','/products/yubie-shake','/products/yubie-ppang','/products/yubie-mie','/account/orders'],authenticationAccepted:true};
test('capabilities fail closed without an approved exact artifact and never enable catalog-profile commerce',()=>{
  const derive=config.deriveYubiCapabilities;
  assert.deepEqual(derive('PUBLIC_CATALOG_NO_SALES',null,'production'),{catalog_available:false,account_available:false,checkout_available:false,order_portal_available:false,human_support_available:false});
  const c=derive('PUBLIC_CATALOG_NO_SALES',evidence,'production');
  assert.equal(c.catalog_available,true);assert.equal(c.account_available,false);assert.equal(c.checkout_available,false);assert.equal(c.order_portal_available,false);
  for(const overrides of [{sourceDirty:true},{approvalStatus:'PENDING'},{canonicalOrigin:'https://evil.test'},{verifiedRoutes:[]},{launchProfile:'DIRECT_COMMERCE_SANDBOX'},{artifactDigest:'wrong'}])assert.equal(derive('PUBLIC_CATALOG_NO_SALES',{...evidence,...overrides},'production').catalog_available,false);
  assert.equal(derive('DIRECT_COMMERCE_SANDBOX',{...evidence,launchProfile:'DIRECT_COMMERCE_SANDBOX'},'production').checkout_available,false);
});
