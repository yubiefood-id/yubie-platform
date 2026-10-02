import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { InventoryLot, InventoryMovement } from "@yubie/domain";
import { InsufficientInventoryError, type InventoryRepository, type InventoryReserveInput, type InventoryReserveOutcome } from "@yubie/application";
import { aggregateLineQuantities, lotIsSellable } from "@yubie/domain";
import type { Database } from "../client.js";
import { inventoryLots, inventoryMovements, inventoryReservations } from "../schema/index.js";

/**
 * PostgreSQL inventory core. reserveForOrder MUST run inside the caller's
 * transaction: sellable lots are selected FOR UPDATE in FEFO order so two
 * concurrent checkouts cannot both take the same stock, and any failure
 * (insufficient sellable quantity) aborts the whole checkout transaction.
 */
export class PostgresInventoryRepository implements InventoryRepository {
  constructor(private readonly database: Database) {}

  async reserveForOrder(input: InventoryReserveInput): Promise<UseCaseResult<InventoryReserveOutcome>> {
    const onDate = input.now.slice(0, 10);
    const aggregated = aggregateLineQuantities(input.lines);

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

        const reservationId = `res_${randomUUID()}`;
        await this.database.db.insert(inventoryReservations).values({
          id: reservationId,
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
        await this.recordMovement(lot, line.productId, line.sizeId, "reserve", -take, input.orderId, null, input.now);
      }
    }
    return ok<InventoryReserveOutcome>({ reserved: true });
  }

  async releaseForOrder(orderId: string, reason: string, now: string): Promise<UseCaseResult<{ released: number }>> {
    const rows = await this.database.db
      .select()
      .from(inventoryReservations)
      .where(and(eq(inventoryReservations.orderId, orderId), eq(inventoryReservations.status, "active")));

    for (const row of rows) {
      await this.database.db
        .update(inventoryReservations)
        .set({ status: "released", reason, updatedAt: now })
        .where(eq(inventoryReservations.id, row.id));

      const lotRows = await this.database.db
        .update(inventoryLots)
        .set({ quantityOnHand: sql`${inventoryLots.quantityOnHand} + ${row.quantity}`, updatedAt: now })
        .where(eq(inventoryLots.id, row.lotId))
        .returning({ status: inventoryLots.status, quantityOnHand: inventoryLots.quantityOnHand, productId: inventoryLots.productId, sizeId: inventoryLots.sizeId });
      const lot = lotRows[0];
      if (lot && lot.status === "depleted" && lot.quantityOnHand > 0) {
        await this.database.db.update(inventoryLots).set({ status: "released", updatedAt: now }).where(eq(inventoryLots.id, row.lotId));
      }
      if (lot) {
        await this.recordMovementById(row.lotId, lot.productId, lot.sizeId, "release_reservation", row.quantity, orderId, reason, now);
      }
    }
    return ok({ released: rows.length });
  }

  async releaseExpired(now: string, limit: number): Promise<UseCaseResult<{ released: number }>> {
    const rows = await this.database.db
      .select({ orderId: inventoryReservations.orderId })
      .from(inventoryReservations)
      .where(and(eq(inventoryReservations.status, "active"), lt(inventoryReservations.expiresAt, now)))
      .limit(limit);

    let released = 0;
    for (const row of rows) {
      const result = await this.releaseForOrder(row.orderId, "reservation_expired", now);
      if (result.ok) released += result.value.released;
    }
    return ok({ released });
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
          gt(inventoryLots.expiryDate, onDate.slice(0, 10)),
        ),
      )
      .orderBy(asc(inventoryLots.expiryDate));
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
          gt(inventoryLots.expiryDate, onDate),
        ),
      )
      .orderBy(asc(inventoryLots.expiryDate))
      .limit(50)
      .for("update");
    return rows.map(mapLotRow).filter((lot) => lotIsSellable(lot, `${onDate}T00:00:00.000Z`));
  }

  private recordMovement(
    lot: InventoryLot,
    productId: string,
    sizeId: string,
    type: InventoryMovement["movementType"],
    delta: number,
    orderId: string | null,
    reason: string | null,
    occurredAt: string,
  ) {
    return this.database.db.insert(inventoryMovements).values({
      id: `mov_${randomUUID()}`,
      lotId: lot.id,
      productId,
      sizeId,
      movementType: type,
      quantityDelta: delta,
      orderId,
      reason,
      occurredAt,
    });
  }

  private recordMovementById(
    lotId: string,
    productId: string,
    sizeId: string,
    type: InventoryMovement["movementType"],
    delta: number,
    orderId: string | null,
    reason: string | null,
    occurredAt: string,
  ) {
    return this.database.db.insert(inventoryMovements).values({
      id: `mov_${randomUUID()}`,
      lotId,
      productId,
      sizeId,
      movementType: type,
      quantityDelta: delta,
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
