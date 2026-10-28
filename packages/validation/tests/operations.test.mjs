import assert from "node:assert/strict";
import test from "node:test";
import * as validation from "../dist/index.js";

test("shipping approval draft requires real references, active ordered dates and an explicit zero-fee policy",()=>{
 assert.equal(typeof validation.shippingPolicyDraftSchema?.safeParse,"function");
 const input={policy:"free_promotional",cities:["TEST_ONLY_CITY"],amount:0,serviceCoverage:"TEST_ONLY_SERVICE",costOwner:"TEST_ONLY_FINANCE",startsAt:"2026-10-28T00:00:00Z",endsAt:"2026-11-01T00:00:00Z",approvalRef:"TEST_ONLY_APPROVAL",verification:{status:"VERIFIED",evidenceRef:"TEST_ONLY_DOCUMENT",verifiedBy:"test-authority",verifiedAt:"2026-10-28T00:00:00Z"}};
 assert(validation.shippingPolicyDraftSchema.safeParse(input).success);
 for(const change of [{policy:"paid"},{amount:1000},{cities:[]},{approvalRef:"PENDING"},{endsAt:"2026-10-27T00:00:00Z"},{verification:{...input.verification,status:"PROPOSED"}}])assert(!validation.shippingPolicyDraftSchema.safeParse({...input,...change}).success);
});
test("operation mutations reject unknown payload fields and client-controlled approvers",()=>{
 assert.equal(typeof validation.operationsApprovalSchema?.safeParse,"function");
 assert(validation.operationsApprovalSchema.safeParse({expectedVersion:1,reason:"Test approval"}).success);
 assert(!validation.operationsApprovalSchema.safeParse({expectedVersion:1,reason:"Test approval",approvedBy:"forged"}).success);
});
