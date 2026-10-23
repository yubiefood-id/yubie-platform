import assert from 'node:assert/strict';
import test from 'node:test';
import * as domain from '../dist/index.js';
test('Yubi resolves four public families and all nine actual catalog variant prices',()=>{
  const expected={flour:[35000,120000],shake:[19500,129000],ppang:[9000,19000,42000],mie:[16000,45000]};
  for(const [id,prices] of Object.entries(expected)) {
    const p=domain.resolveYubiProduct(id);
    assert.equal(p.websiteUrl,`https://yubiefood.com/products/yubie-${id}`);
    assert.deepEqual(p.variantPrices,prices);
    assert.equal(p.assetId,undefined,'concept assets must not become approved WhatsApp photos');
  }
  for(const id of ['../flour','https://evil.test','shake?x=1','unknown'])assert.equal(domain.resolveYubiProduct(id),null);
});
