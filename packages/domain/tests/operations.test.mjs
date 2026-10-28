import assert from "node:assert/strict";
import test from "node:test";
import * as domain from "../dist/index.js";

const now="2026-10-28T09:00:00.000Z";
function verified() {
  const physical=[["flour","250g",15],["flour","1kg",5],["shake","sachet",20],["ppang","mini",15],["ppang","maxi",5],["mie","single",20]];
  return {documentType:"YUBIE_VERIFIED_INVENTORY_INTAKE_V1",purpose:"initial_inventory",sourceSha256:"a".repeat(64),verification:{status:"VERIFIED",evidenceRef:"TEST_ONLY_PHYSICAL_COUNT",verifiedBy:"test-counter",verifiedAt:now},inventory:{operationId:"test_only_count",actor:"test-counter",reason:"Isolated unit fixture, never import",countedAt:now,policies:[...physical.map(([productId,sizeId])=>({productId,sizeId,version:1,approvalRef:"TEST_ONLY_PACKAGING",components:[{productId,sizeId,quantity:1}]})),{productId:"shake",sizeId:"pack-7",version:1,approvalRef:"TEST_ONLY_PACKAGING",components:[{productId:"shake",sizeId:"sachet",quantity:7}]}],lots:physical.map(([productId,sizeId,quantity])=>({productId,sizeId,lotCode:`TEST_ONLY_${productId}_${sizeId}`,unitOfMeasure:"test-unit",expiryDate:"2027-01-01",countedUncommittedQuantity:quantity,expectedAvailable:0,status:"released",qcApprovalRef:"TEST_ONLY_QC"}))}};
}

test("operations permission matrix separates stock, QC, fulfillment and Finance",()=>{
 assert.equal(typeof domain.canOperate,"function");
 assert(domain.canOperate(["operator"],"inventory:propose"));
 assert(!domain.canOperate(["operator"],"inventory:approve"));
 assert(domain.canOperate(["qc"],"inventory:approve"));
 assert(!domain.canOperate(["admin"],"refunds:approve"));
 assert(!domain.canOperate(["viewer"],"payments:read"));
 assert(domain.canOperate(["fulfillment"],"fulfillment:write"));
 assert(!domain.canOperate(["unknown"],"staff:manage"));
});
test("a planning proposal is never an executable physical inventory intake",()=>{
 assert.equal(typeof domain.validateVerifiedInventoryIntake,"function");
 assert.throws(()=>domain.validateVerifiedInventoryIntake({documentType:"YUBIE_PROPOSAL_ONLY_NOT_EXECUTABLE"},now),/verified|proposal/i);
 const input=verified();input.verification.status="PROPOSED";
 assert.throws(()=>domain.validateVerifiedInventoryIntake(input,now),/verified|proposal/i);
});
test("initial intake validates real-field shape, family totals and component pools",()=>{
 assert.equal(typeof domain.validateVerifiedInventoryIntake,"function");
 const input=verified();assert.doesNotThrow(()=>domain.validateVerifiedInventoryIntake(input,now));
 input.inventory.lots[0].countedUncommittedQuantity=20;
 assert.throws(()=>domain.validateVerifiedInventoryIntake(input,now),/family|keluarga|20/i);
});
test("derived bundles cannot also introduce a physical independent lot",()=>{
 assert.equal(typeof domain.validateVerifiedInventoryIntake,"function");
 const input=verified();input.inventory.lots.push({...input.inventory.lots[2],sizeId:"pack-7",countedUncommittedQuantity:0});
 assert.throws(()=>domain.validateVerifiedInventoryIntake(input,now),/bundle|component|bundel/i);
});
test("text placeholders cannot become QC or packaging evidence",()=>{
 assert.equal(typeof domain.validateVerifiedInventoryIntake,"function");
 const input=verified();input.inventory.lots[0].qcApprovalRef="BELUM DIISI";
 assert.throws(()=>domain.validateVerifiedInventoryIntake(input,now),/pending|placeholder|belum/i);
});
test("count verification cannot be future-dated or predate the actual count",()=>{
 const future=verified();future.inventory.countedAt="2026-10-28T09:10:00.000Z";
 assert.throws(()=>domain.validateVerifiedInventoryIntake(future,now),/time|future|verification/i);
 const old=verified();old.verification.verifiedAt="2025-10-28T09:00:00.000Z";
 assert.throws(()=>domain.validateVerifiedInventoryIntake(old,now),/time|verification/i);
});
test("approval requires a different named person even when one user has both roles",()=>{
 assert.equal(typeof domain.assertOperationsApproval,"function");
 assert.throws(()=>domain.assertOperationsApproval("inventory_count","same","same",["operator","qc"]),/different|berbeda/i);
 assert.throws(()=>domain.assertOperationsApproval("inventory_count","counter","admin",["admin"]),/permission|izin/i);
 assert.doesNotThrow(()=>domain.assertOperationsApproval("inventory_count","counter","reviewer",["qc"]));
});
test("fulfillment cannot bypass paid status, lot holds, packing or tracking",()=>{
 assert.equal(typeof domain.assertFulfillmentTransition,"function");
 const ready={orderStatus:"paid",paymentVerified:true,hold:null};
 assert.doesNotThrow(()=>domain.assertFulfillmentTransition(null,"packing",ready));
 assert.throws(()=>domain.assertFulfillmentTransition(null,"packing",{...ready,paymentVerified:false}),/paid|payment/i);
 assert.throws(()=>domain.assertFulfillmentTransition(null,"packing",{...ready,hold:"lot_recalled"}),/hold/i);
 assert.throws(()=>domain.assertFulfillmentTransition("packing","shipped",ready),/transition/i);
 assert.throws(()=>domain.assertFulfillmentTransition("packed","shipped",ready),/tracking|carrier/i);
 assert.doesNotThrow(()=>domain.assertFulfillmentTransition("packed","shipped",{...ready,orderStatus:"processing",carrier:"TEST_ONLY_COURIER",trackingNumber:"TEST_ONLY_TRACKING"}));
});
test("manual refund workflow refuses partial or unverified payments",()=>{
 assert.equal(typeof domain.assertFullRefund,"function");
 assert.doesNotThrow(()=>domain.assertFullRefund({orderTotal:35000,amount:35000,paymentStatus:"succeeded",existingRefund:false}));
 assert.throws(()=>domain.assertFullRefund({orderTotal:35000,amount:1000,paymentStatus:"succeeded",existingRefund:false}),/full|penuh/i);
 assert.throws(()=>domain.assertFullRefund({orderTotal:35000,amount:35000,paymentStatus:"pending",existingRefund:false}),/paid|succeeded/i);
});
