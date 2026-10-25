import { createHash, randomUUID } from "node:crypto";
import {validateInventoryOnboarding,assertInventoryLotChange,assertInventoryPackagingChange,type InventoryOnboardingInput} from "@yubie/domain";
export type {InventoryOnboardingInput} from "@yubie/domain";
import type { Database } from "../client.js";

/** Explicit count reconciliation, never a seed. Counted quantity EXCLUDES
 * committed/reserved customer stock; the operator must reconcile those units
 * separately before signing this input. The operation identity is immutable. */
export class PostgresInventoryOnboarding {
  constructor(private readonly database: Database) {}

  async run(input: InventoryOnboardingInput, apply: boolean) {
    if(!input||!/^[A-Za-z0-9_-]{1,100}$/.test(input.operationId))throw new Error("Invalid operation identity");
    const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return this.database.client.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('inventory-onboarding',0))`;
      const prior = await tx`SELECT input_hash, result FROM inventory_onboarding_operations WHERE operation_id=${input.operationId}`;
      if (prior[0]) {
        if (prior[0].input_hash !== inputHash) throw new Error("Operation identity already belongs to a different input");
        return prior[0].result as { applied: boolean; adjustments: Array<{ productId: string; sizeId: string; lotCode: string; before: number; after: number; delta: number }> };
      }
      validateInventoryOnboarding(input,new Date().toISOString());
      // Lock packaging before lots, matching checkout's lock order.
      await tx`SELECT product_id FROM inventory_sku_policies ORDER BY product_id,size_id FOR UPDATE`;
      const adjustments = [];
      for (const lot of [...input.lots].sort((a,b)=>a.productId.localeCompare(b.productId)||a.sizeId.localeCompare(b.sizeId)||a.lotCode.localeCompare(b.lotCode))) {
        const rows = await tx`SELECT id,quantity_on_hand,status,expiry_date::text,unit_of_measure FROM inventory_lots WHERE product_id=${lot.productId} AND size_id=${lot.sizeId} AND lot_code=${lot.lotCode} FOR UPDATE`;
        const current = rows[0]; const before = current?.quantity_on_hand ?? 0;
        assertInventoryLotChange(current?{status:String(current.status),expiryDate:String(current.expiry_date),unitOfMeasure:current.unit_of_measure?String(current.unit_of_measure):null}:null,lot);
        if (before !== lot.expectedAvailable) throw new Error("Inventory baseline is stale; rerun the dry-run and verify the count");
        const delta = lot.countedUncommittedQuantity-before;
        adjustments.push({productId:lot.productId,sizeId:lot.sizeId,lotCode:lot.lotCode,before,after:lot.countedUncommittedQuantity,delta});
        if (!apply) continue;
        const id = current?.id ?? `lot_${randomUUID()}`;
        if (current) {
          await tx`UPDATE inventory_lots SET quantity_on_hand=${lot.countedUncommittedQuantity},expiry_date=${lot.expiryDate},status=${lot.status},qc_approval_ref=${lot.qcApprovalRef??null},unit_of_measure=${lot.unitOfMeasure},released_at=${lot.status==="released"?new Date().toISOString():null},release_reason=${lot.status==="released"?input.reason:null},updated_at=now() WHERE id=${id}`;
        } else {
          await tx`INSERT INTO inventory_lots(id,product_id,size_id,lot_code,quantity_on_hand,expiry_date,status,qc_approval_ref,unit_of_measure,released_at,release_reason,created_at,updated_at) VALUES(${id},${lot.productId},${lot.sizeId},${lot.lotCode},${lot.countedUncommittedQuantity},${lot.expiryDate},${lot.status},${lot.qcApprovalRef??null},${lot.unitOfMeasure},${lot.status==="released"?new Date().toISOString():null},${lot.status==="released"?input.reason:null},now(),now())`;
        }
        if(lot.status==="recalled"){
          const affected=await tx`UPDATE orders SET fulfillment_hold=coalesce(fulfillment_hold,'lot_recalled') WHERE id IN (SELECT order_id FROM inventory_reservations WHERE lot_id=${id} AND status IN ('active','consumed')) AND status NOT IN ('shipped','completed','cancelled') RETURNING id`;
          for(const order of affected){
            await tx`INSERT INTO audit_events(id,actor,action,resource_type,resource_id,occurred_at) VALUES(${'audit_'+randomUUID()},${input.actor},'inventory.recall_hold','order',${order.id},now())`;
            await tx`INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_id,payload_json,dedupe_key,status,available_at,attempt_count) VALUES(${'outbox_'+randomUUID()},'inventory.recall_hold','order',${order.id},${JSON.stringify({orderId:order.id,operationId:input.operationId,reason:'lot_recalled'})},${'inventory:recall:'+input.operationId+':'+order.id},'pending',now(),0) ON CONFLICT(dedupe_key) DO NOTHING`;
          }
        }
        await tx`INSERT INTO inventory_movements(id,lot_id,product_id,size_id,movement_type,quantity_delta,reason,occurred_at) VALUES(${'mov_'+randomUUID()},${id},${lot.productId},${lot.sizeId},${current?"adjust":"receive"},${delta},${input.operationId+":"+input.reason},now())`;
      }
      if (apply) {
        for (const policy of input.policies) {
          const priorPolicy = await tx`SELECT version,components,approval_ref FROM inventory_sku_policies WHERE product_id=${policy.productId} AND size_id=${policy.sizeId}`;
          assertInventoryPackagingChange(priorPolicy[0]?{productId:policy.productId,sizeId:policy.sizeId,version:Number(priorPolicy[0].version),approvalRef:String(priorPolicy[0].approval_ref),components:priorPolicy[0].components}:null,policy);
          await tx`INSERT INTO inventory_sku_policies(product_id,size_id,version,components,approval_ref,approved_by,approved_at) VALUES(${policy.productId},${policy.sizeId},${policy.version},${JSON.stringify(policy.components)}::jsonb,${policy.approvalRef},${input.actor},now()) ON CONFLICT(product_id,size_id) DO UPDATE SET version=EXCLUDED.version,components=EXCLUDED.components,approval_ref=EXCLUDED.approval_ref,approved_by=EXCLUDED.approved_by,approved_at=EXCLUDED.approved_at`;
        }
      }
      const result = {applied:apply,adjustments};
      if (apply) {
        await tx`INSERT INTO inventory_onboarding_operations(operation_id,input_hash,input_snapshot,result,actor,reason,occurred_at) VALUES(${input.operationId},${inputHash},${JSON.stringify(input)}::jsonb,${JSON.stringify(result)}::jsonb,${input.actor},${input.reason},now())`;
        await tx`INSERT INTO audit_events(id,actor,action,resource_type,resource_id,occurred_at) VALUES(${'audit_'+randomUUID()},${input.actor},'inventory.count_applied','inventory-operation',${input.operationId},now())`;
        await tx`INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_id,payload_json,dedupe_key,status,available_at,attempt_count) VALUES(${'outbox_'+randomUUID()},'inventory.count_applied','inventory-operation',${input.operationId},${JSON.stringify({operationId:input.operationId})},${'inventory:'+input.operationId},'pending',now(),0)`;
      }
      return result;
    });
  }
}
