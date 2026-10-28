import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { InventoryLot, InventoryMovement } from "@yubie/domain";
import { InsufficientInventoryError, type InventoryRepository, type InventoryReserveInput, type InventoryReserveOutcome } from "@yubie/application";
import { expandInventoryDemand, inventoryCapacity, lotIsSellable, productFamilies, type InventorySkuPolicy } from "@yubie/domain";
import type { Database } from "../client.js";
import { inventoryLots, inventoryMovements, inventoryReservations } from "../schema/index.js";

/**
 * PostgreSQL inventory core. reserveForOrder MUST run inside the caller's
 * transaction: sellable lots are selected FOR UPDATE in FEFO order so two
 * concurrent checkouts cannot both take the same stock, and any failure
 * (insufficient sellable quantity) aborts the whole checkout transaction.
 *
 * release/consume flip reservations with a status-guarded UPDATE and use the
 * affected row count, so a webhook release racing the reconciliation path can
 * never restore the same lot quantity twice (and consume never touches
 * quantity at all — it was deducted at reserve time).
 */
export class PostgresInventoryRepository implements InventoryRepository {
  constructor(private readonly database: Database) {}
  async checkoutFrozen(): Promise<boolean> {
    await this.database.db.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtextextended('commerce-admission',0))`);
    const rows = await this.database.db.execute(sql`SELECT EXISTS(SELECT 1 FROM ops_checkout_freeze WHERE expires_at>now()) frozen`);
    return rows[0]?.frozen === true;
  }

  async reserveForOrder(input: InventoryReserveInput): Promise<UseCaseResult<InventoryReserveOutcome>> {
    const onDate = input.now.slice(0, 10);
    const policies = await this.policies(true);
    let aggregated;
    try { aggregated = expandInventoryDemand(input.lines, policies); }
    catch { const line=input.lines[0]!; throw new InsufficientInventoryError(line.productId,line.sizeId,line.quantity,0); }

    for (const line of aggregated) {
      const lots = await this.lockSellableLots(line.productId, line.sizeId, onDate);
      const available = lots.reduce((sum, lot) => sum + lot.quantityOnHand, 0);
      if (available < line.quantity) {
        // Throwing aborts the surrounding checkout transaction: no draft
        // order, intent, audit or outbox row survives an inventory failure.
        throw new InsufficientInventoryError(line.productId, line.sizeId, line.quantity, available);
      }

      let remaining = line.quantity;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantityOnHand, remaining);
        remaining -= take;
        const depleted = lot.quantityOnHand - take === 0;

        await this.database.db
          .update(inventoryLots)
          .set({ quantityOnHand: lot.quantityOnHand - take, ...(depleted ? { status: "depleted" as const } : {}), updatedAt: input.now })
          .where(eq(inventoryLots.id, lot.id));

        await this.database.db.insert(inventoryReservations).values({
          id: `res_${randomUUID()}`,
          orderId: input.orderId,
          lotId: lot.id,
          productId: line.productId,
          sizeId: line.sizeId,
          quantity: take,
          status: "active",
          reason: null,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        });
        await this.recordMovement(lot.id, line.productId, line.sizeId, "reserve", -take, input.orderId, null, input.now);
      }
    }
    return ok<InventoryReserveOutcome>({ reserved: true });
  }

  async releaseForOrder(orderId: string, reason: string, now: string): Promise<UseCaseResult<{ released: number }>> {
    // Status-guarded flip: exactly one concurrent caller wins each row.
    const flipped = await this.database.db
      .update(inventoryReservations)
      .set({ status: "released", reason, updatedAt: now })
      .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")))
      .returning({ id: inventoryReservations.id, lotId: inventoryReservations.lotId, productId: inventoryReservations.productId, sizeId: inventoryReservations.sizeId, quantity: inventoryReservations.quantity });

    for (const row of flipped) {
      const lotRows = await this.database.db
        .update(inventoryLots)
        .set({ quantityOnHand: sql`${inventoryLots.quantityOnHand} + ${row.quantity}`, updatedAt: now })
        .where(eq(inventoryLots.id, row.lotId))
        .returning({ status: inventoryLots.status, quantityOnHand: inventoryLots.quantityOnHand });
      const lot = lotRows[0];
      if (lot && lot.status === "depleted" && lot.quantityOnHand > 0) {
        await this.database.db.update(inventoryLots).set({ status: "released", updatedAt: now }).where(eq(inventoryLots.id, row.lotId));
      }
      await this.recordMovement(row.lotId, row.productId, row.sizeId, "release_reservation", row.quantity, orderId, reason, now);
    }
    return ok({ released: flipped.length });
  }

  async consumeForOrder(orderId: string, now: string): Promise<UseCaseResult<{ consumed: number }>> {
    const flipped = await this.database.db
      .update(inventoryReservations)
      .set({ status: "consumed", updatedAt: now })
      .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")))
      .returning({ lotId: inventoryReservations.lotId, productId: inventoryReservations.productId, sizeId: inventoryReservations.sizeId });

    for (const row of flipped) {
      const unsafe = await this.database.db.execute(sql`SELECT id FROM inventory_lots WHERE id=${row.lotId} AND (status IN ('received','quarantined','recalled') OR expiry_date<=${now.slice(0,10)}::date OR coalesce(length(trim(qc_approval_ref)),0)=0) FOR UPDATE`);
      if(unsafe.length){
        await this.database.db.execute(sql`UPDATE orders SET fulfillment_hold='lot_unavailable_after_reservation' WHERE id=${orderId}`);
        await this.database.db.execute(sql`INSERT INTO audit_events(id,actor,action,resource_type,resource_id,occurred_at) VALUES(${"audit_"+randomUUID()},'payment-settlement','inventory.fulfillment_hold','order',${orderId},${now}::timestamptz)`);
        await this.database.db.execute(sql`INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_id,payload_json,dedupe_key,status,available_at,attempt_count) VALUES(${"outbox_"+randomUUID()},'inventory.fulfillment_hold','order',${orderId},${JSON.stringify({orderId,reason:"lot_unavailable_after_reservation"})},${"inventory:hold:"+orderId+":"+row.lotId},'pending',${now}::timestamptz,0) ON CONFLICT(dedupe_key) DO NOTHING`);
      }
      // Quantity was already deducted at reserve time; consume is a pure
      // lifecycle close with a zero-delta movement for lot traceability.
      await this.recordMovement(row.lotId, row.productId, row.sizeId, "consume", 0, orderId, "payment_confirmed", now);
    }
    return ok({ consumed: flipped.length });
  }

  async listSellable(productId: string, sizeId: string, onDate: string) {
    const rows = await this.database.db
      .select()
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.productId, productId),
          eq(inventoryLots.sizeId, sizeId),
          eq(inventoryLots.status, "released"),
          sql`qc_approval_ref IS NOT NULL AND length(trim(qc_approval_ref)) > 0 AND released_at IS NOT NULL`,
          gt(inventoryLots.expiryDate, onDate.slice(0, 10)),
        ),
      )
      .orderBy(asc(inventoryLots.expiryDate), asc(inventoryLots.lotCode));
    const lots = rows.map(mapLotRow).filter((lot) => lotIsSellable(lot, onDate));
    return ok(lots);
  }

  private async lockSellableLots(productId: string, sizeId: string, onDate: string) {
    const rows = await this.database.db
      .select()
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.productId, productId),
          eq(inventoryLots.sizeId, sizeId),
          eq(inventoryLots.status, "released"),
          sql`qc_approval_ref IS NOT NULL AND length(trim(qc_approval_ref)) > 0 AND released_at IS NOT NULL`,
          gt(inventoryLots.expiryDate, onDate),
        ),
      )
      // FEFO with the domain's lot-code tie-break; bounded well above any
      // realistic per-SKU lot count so far lots are never invisible.
      .orderBy(asc(inventoryLots.expiryDate), asc(inventoryLots.lotCode))
      .limit(200)
      .for("update");
    return rows.map(mapLotRow).filter((lot) => lotIsSellable(lot, `${onDate}T00:00:00.000Z`));
  }

  private async policies(lock = false): Promise<InventorySkuPolicy[]> {
    const rows = await this.database.db.execute(sql`SELECT product_id,size_id,version,components,approval_ref FROM inventory_sku_policies ORDER BY product_id,size_id ${lock ? sql`FOR SHARE` : sql``}`);
    return rows.map(row=>({productId:String(row.product_id),sizeId:String(row.size_id),version:Number(row.version),approvalRef:String(row.approval_ref),components:row.components as InventorySkuPolicy["components"]}));
  }

  async availability(onDate: string) {
    const policies = await this.policies();
    const rows = await this.database.db.execute(sql`SELECT product_id,size_id,sum(quantity_on_hand)::integer AS quantity FROM inventory_lots WHERE status='released' AND expiry_date>${onDate.slice(0,10)}::date AND released_at IS NOT NULL AND length(trim(qc_approval_ref))>0 GROUP BY product_id,size_id`);
    const physical = rows.map(row=>({productId:String(row.product_id),sizeId:String(row.size_id),quantity:Number(row.quantity)}));
    return productFamilies.flatMap(product=>product.sizes.map(size=>{
      const policy=policies.find(p=>p.productId===product.id&&p.sizeId===size.id);
      const maxQuantity=policy?inventoryCapacity(policy,physical):0;
      return {productId:product.id,sizeId:size.id,maxQuantity,status:policy?(maxQuantity>0?"available" as const:"unavailable" as const):"unverified" as const};
    }));
  }

  async canFulfill(lines: Array<{productId:string;sizeId:string;quantity:number}>, now:string): Promise<boolean> {
    let demand;
    try { demand=expandInventoryDemand(lines,await this.policies()); } catch { return false; }
    for(const line of demand) {
      const lots=await this.listSellable(line.productId,line.sizeId,now);
      if(!lots.ok || lots.value.reduce((sum,lot)=>sum+lot.quantityOnHand,0)<line.quantity)return false;
    }
    return true;
  }

  private recordMovement(
    lotId: string,
    productId: string,
    sizeId: string,
    movementType: InventoryMovement["movementType"],
    quantityDelta: number,
    orderId: string | null,
    reason: string | null,
    occurredAt: string,
  ) {
    return this.database.db.insert(inventoryMovements).values({
      id: `mov_${randomUUID()}`,
      lotId,
      productId,
      sizeId,
      movementType,
      quantityDelta,
      orderId,
      reason,
      occurredAt,
    });
  }
}

function mapLotRow(row: typeof inventoryLots.$inferSelect): InventoryLot {
  const expiry = row.expiryDate;
  return {
    id: row.id,
    productId: row.productId,
    sizeId: row.sizeId,
    lotCode: row.lotCode,
    quantityOnHand: row.quantityOnHand,
    expiryDate: typeof expiry === "string" ? expiry : String(expiry),
    status: row.status as InventoryLot["status"],
    releasedAt: row.releasedAt,
    releaseReason: row.releaseReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
