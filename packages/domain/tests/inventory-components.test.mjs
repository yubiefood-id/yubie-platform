import assert from 'node:assert/strict';
import test from 'node:test';
import * as inventory from '../src/inventory.ts';

const policies = [
  { productId:'shake',sizeId:'sachet',version:1,approvalRef:'ops-fixture',components:[{productId:'shake',sizeId:'sachet',quantity:1}] },
  { productId:'shake',sizeId:'pack-7',version:1,approvalRef:'ops-fixture',components:[{productId:'shake',sizeId:'sachet',quantity:7}] },
];
test('singles and bundles share one physical demand instead of independent stock',()=>{
  assert.equal(typeof inventory.expandInventoryDemand,'function');
  assert.deepEqual(inventory.expandInventoryDemand([{productId:'shake',sizeId:'pack-7',quantity:2},{productId:'shake',sizeId:'sachet',quantity:7}],policies),[{productId:'shake',sizeId:'sachet',quantity:21}]);
});
test('unconfigured recipes and invalid component quantities cannot reserve stock',()=>{
  assert.equal(typeof inventory.expandInventoryDemand,'function');
  assert.throws(()=>inventory.expandInventoryDemand([{productId:'mie',sizeId:'pack-3',quantity:1}],policies),/configuration/);
  assert.throws(()=>inventory.expandInventoryDemand([{productId:'shake',sizeId:'pack-7',quantity:1}],[{...policies[1],components:[{productId:'shake',sizeId:'sachet',quantity:0}]}]),/component/);
  assert.throws(()=>inventory.expandInventoryDemand([{productId:'shake',sizeId:'pack-7',quantity:1}],[{...policies[1],components:[{productId:'shake',sizeId:'sachet',quantity:1}]}]),/component/);
});
test('bundle capacity is floored and rejects missing component evidence',()=>{
  assert.equal(typeof inventory.inventoryCapacity,'function');
  assert.equal(inventory.inventoryCapacity(policies[1],[{productId:'shake',sizeId:'sachet',quantity:20}]),2);
  assert.equal(inventory.inventoryCapacity({...policies[1],approvalRef:''},[{productId:'shake',sizeId:'sachet',quantity:20}]),0);
});
