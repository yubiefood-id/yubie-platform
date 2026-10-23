import test from 'node:test';import assert from 'node:assert/strict';import * as domain from '../dist/index.js';
test('a leaked code alone cannot authorize a discount',()=>{
 assert.equal(domain.quotePromotion('YUBIE15',100000),null);
});
test('approved campaign arithmetic discounts only an eligible subtotal and rejects inactive policy',()=>{
 const campaign={id:'campaign_synthetic',code:'YUBIE15',status:'active',basisPoints:1500,eligibleProductIds:['flour'],startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-11-01T00:00:00Z',approvedAt:'2026-09-30T00:00:00Z',approvedBy:'synthetic-operator',approvalRef:'synthetic',refundPolicy:'retain_consumed'};
 const quote=domain.quoteApprovedCampaign(campaign,[{productId:'flour',unitPrice:35000,quantity:2},{productId:'shake',unitPrice:19500,quantity:1}],'2026-10-23T12:00:00Z');
 assert.equal(quote.discountAmount,10500);assert.equal(quote.eligibleSubtotalAmount,70000);
 assert.equal(domain.quoteApprovedCampaign({...campaign,status:'draft'},[{productId:'flour',unitPrice:35000,quantity:1}],'2026-10-23T12:00:00Z'),null);
});

test('promotion arithmetic rejects an unsafe scaled intermediate',()=>{
 const c={id:'synthetic',code:'YUBIE15',status:'active',basisPoints:1500,eligibleProductIds:['flour'],startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-11-01T00:00:00Z',approvedAt:'2026-09-30T00:00:00Z',approvedBy:'synthetic',approvalRef:'synthetic',refundPolicy:'retain_consumed'};
 assert.equal(domain.quoteApprovedCampaign(c,[{productId:'flour',unitPrice:Number.MAX_SAFE_INTEGER,quantity:1}],'2026-10-23T12:00:00Z'),null);
});
