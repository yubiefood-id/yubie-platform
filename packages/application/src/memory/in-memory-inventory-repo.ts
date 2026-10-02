import { randomUUID } from "node:crypto";
import { aggregateLineQuantities, fefoOrder, lotIsSellable, ok } from "@yubie/domain";
import type { InventoryLot, InventoryMovement, InventoryReservation } from "@yubie/domain";
import { InsufficientInventoryError, type InventoryRepository, type InventoryReserveInput, type InventoryReserveOutcome } from "../ports.js";

/**
 * Test/local inventory (mirrors the Postgres FEFO semantics). Like the
 * Postgres implementation, reserveForOrder validates full availability for
 * every line BEFORE writing and throws InsufficientInventoryError on a
 * shortfall, so an insufficient failure leaves no partial state.
 */
export class InMemoryInventoryRepository implements InventoryRepository {
  readonly lots = new Map<string, InventoryLot>();
  readonly reservations = new Map<string, InventoryReservation>();
  readonly movements: InventoryMovement[] = [];

  seedLot(lot: Omit<InventoryLot, "updatedAt"> & { updatedAt?: string }): InventoryLot {
    const full = { ...lot, updatedAt: lot.updatedAt ?? lot.createdAt } as InventoryLot;
    this.lots.set(full.id, full);
    return full;
  }

  async reserveForOrder(input: InventoryReserveInput) {
    const aggregated = aggregateLineQuantities(input.lines);
    const onDate = input.now.slice(0, 10);

    // Validate every line first: no partial reservations on failure.
    for (const line of aggregated) {
      const available = this.sellableLots(line.productId, line.sizeId, onDate).reduce((sum, lot) => sum + lot.quantityOnHand, 0);
      if (available < line.quantity) {
        throw new InsufficientInventoryError(line.productId, line.sizeId, line.quantity, available);
      }
    }

    for (const line of aggregated) {
      let remaining = line.quantity;
      for (const lot of this.sellableLots(line.productId, line.sizeId, onDate)) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantityOnHand, remaining);
        lot.quantityOnHand -= take;
        if (lot.quantityOnHand === 0) lot.status = "depleted";
        lot.updatedAt = input.now;
        remaining -= take;

        const reservation: InventoryReservation = {
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
        };
        this.reservations.set(reservation.id, reservation);
        this.movements.push({ id: `mov_${randomUUID()}`, lotId: lot.id, productId: line.productId, sizeId: line.sizeId, movementType: "reserve", quantityDelta: -take, orderId: input.orderId, reason: null, occurredAt: input.now });
      }
    }
    return ok<InventoryReserveOutcome>({ reserved: true });
  }

  async releaseForOrder(orderId: string, reason: string, now: string) {
    let released = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.orderId !== orderId || reservation.status !== "active") continue;
      reservation.status = "released";
      reservation.reason = reason;
      reservation.updatedAt = now;
      released += 1;
      const lot = this.lots.get(reservation.lotId);
      if (lot) {
        lot.quantityOnHand += reservation.quantity;
        if (lot.status === "depleted" && lot.quantityOnHand > 0) lot.status = "released";
        lot.updatedAt = now;
      }
      this.movements.push({ id: `mov_${randomUUID()}`, lotId: reservation.lotId, productId: reservation.productId, sizeId: reservation.sizeId, movementType: "release_reservation", quantityDelta: reservation.quantity, orderId, reason, occurredAt: now });
    }
    return ok({ released });
  }

  async releaseExpired(now: string, limit: number) {
    let released = 0;
    for (const reservation of this.reservations.values()) {
      if (released >= limit) break;
      if (reservation.status === "active" && reservation.expiresAt < now) {
        const result = await this.releaseForOrder(reservation.orderId, "reservation_expired", now);
        if (result.ok) released += result.value.released;
      }
    }
    return ok({ released });
  }

  async listSellable(productId: string, sizeId: string, onDate: string) {
    return ok(this.sellableLots(productId, sizeId, onDate.slice(0, 10)));
  }

  private sellableLots(productId: string, sizeId: string, onDate: string): InventoryLot[] {
    return [...this.lots.values()].filter((lot) => lot.productId === productId && lot.sizeId === sizeId && lotIsSellable(lot, onDate)).sort(fefoOrder);
  }
}
