import test from 'node:test';
import assert from 'node:assert/strict';
import * as app from '../dist/index.js';
test('quote uses catalog prices and refuses unapproved shipping without creating state',async()=>{
 assert.equal(typeof app.quoteCheckout,'function');
 const repos={inventory:{canFulfill:async()=>false}};
 const quote=await app.quoteCheckout({lines:[{productId:'flour',sizeId:'250g',quantity:2}]},{tx:{run:async(_name,fn)=>fn(repos)},clock:{now:()=>new Date().toISOString()}});
 assert.equal(quote.ok,true);assert.equal(quote.value.subtotalAmount,70000);
 assert.equal(quote.value.totalAmount,null);assert.equal(quote.value.shippingAvailable,false);assert.equal(quote.value.stockAvailable,false);
});
test('quote never clamps a tampered quantity into an accepted purchase',async()=>{
 assert.equal(typeof app.priceCheckoutLines,'function');
 assert.throws(()=>app.priceCheckoutLines([{productId:'flour',sizeId:'250g',quantity:0}]),/quantity/);
 assert.throws(()=>app.priceCheckoutLines([{productId:'flour',sizeId:'250g',quantity:21}]),/quantity/);
});
