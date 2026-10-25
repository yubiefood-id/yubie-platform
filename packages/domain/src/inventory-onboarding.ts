import {productFamilies} from "./product-discovery.js";
import {expandInventoryDemand,type InventorySkuPolicy} from "./inventory.js";

export interface InventoryOnboardingInput {
  operationId: string; actor: string; reason: string; countedAt: string;
  policies: InventorySkuPolicy[];
  lots: Array<{
    productId: string; sizeId: string; lotCode: string; unitOfMeasure: string;
    expiryDate: string; countedUncommittedQuantity: number; expectedAvailable: number;
    status: "received" | "quarantined" | "released" | "recalled" | "depleted";
    qcApprovalRef?: string | undefined;
  }>;
}

export function validateInventoryOnboarding(input: InventoryOnboardingInput, now: string) {
  if (!input || !/^[A-Za-z0-9_-]{1,100}$/.test(input.operationId) || !input.actor?.trim() || !input.reason?.trim() || !Number.isFinite(Date.parse(input.countedAt)) || !Array.isArray(input.lots) || !input.lots.length || !Array.isArray(input.policies)) throw new Error("Invalid inventory count metadata");
  if(Math.abs(Date.parse(now)-Date.parse(input.countedAt))>15*60*1000)throw new Error("Physical count is stale; recount under an admission freeze");
  const validSku = (productId:string,sizeId:string) => productFamilies.some(p=>p.id===productId && p.sizes.some(s=>s.id===sizeId));
  const seen = new Set<string>();
  for (const lot of input.lots) {
    const key = JSON.stringify([lot.productId,lot.sizeId,lot.lotCode]);
    if (seen.has(key)) throw new Error("Duplicate physical lot in count"); seen.add(key);
    if (!validSku(lot.productId,lot.sizeId) || !lot.lotCode?.trim() || !lot.unitOfMeasure?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(lot.expiryDate) || !Number.isFinite(Date.parse(lot.expiryDate)) || !Number.isSafeInteger(lot.countedUncommittedQuantity) || lot.countedUncommittedQuantity<0 || !Number.isSafeInteger(lot.expectedAvailable) || lot.expectedAvailable<0 || !["received","quarantined","released","recalled","depleted"].includes(lot.status)) throw new Error("Invalid physical count/lot");
    if (lot.status==="released" && (!lot.qcApprovalRef?.trim() || lot.expiryDate<=now.slice(0,10))) throw new Error("QC release evidence and future expiry are required");
  }
  const seenPolicies = new Set<string>();
  for (const policy of input.policies) {
    const key = policy.productId+"/"+policy.sizeId;
    if (seenPolicies.has(key)) throw new Error("Duplicate packaging instruction"); seenPolicies.add(key);
    if (!validSku(policy.productId,policy.sizeId) || policy.components.some(c=>!validSku(c.productId,c.sizeId))) throw new Error("Unknown packaging SKU");
    expandInventoryDemand([{productId:policy.productId,sizeId:policy.sizeId,quantity:1}],[policy]);
  }
}

export function assertInventoryLotChange(current:{status:string;expiryDate:string;unitOfMeasure:string|null}|null,next:InventoryOnboardingInput["lots"][number]) {
 if(!current)return;
 if(current.status==="recalled"&&next.status!=="recalled")throw new Error("A recalled lot requires a separately reviewed disposition; routine onboarding cannot re-release it");
 if(current.expiryDate!==next.expiryDate)throw new Error("Lot expiry correction requires a separately reviewed repair");
 if(current.unitOfMeasure&&current.unitOfMeasure!==next.unitOfMeasure)throw new Error("Physical unit of measure cannot change during a recount");
}

export function assertInventoryPackagingChange(current:InventorySkuPolicy|null,next:InventorySkuPolicy) {
 if(!current)return;
 const changed=current.approvalRef!==next.approvalRef||current.components.length!==next.components.length||current.components.some((c,i)=>c.productId!==next.components[i]?.productId||c.sizeId!==next.components[i]?.sizeId||c.quantity!==next.components[i]?.quantity);
 if(next.version<current.version||(changed&&next.version<=current.version))throw new Error("Changed packaging requires a new approved version");
 if(changed&&current.approvalRef===next.approvalRef)throw new Error("Changed packaging requires fresh approval evidence");
}
