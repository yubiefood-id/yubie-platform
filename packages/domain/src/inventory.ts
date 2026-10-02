/**
 * Minimal lot-aware inventory language (B7). Only RELEASED lots inside their
 * sellable window may serve a reservation; quarantined, recalled, expired and
 * unreleased lots are never sellable (01_PRODUCT_TRUTH_AND_FOOD_COMPLIANCE
 * §4). Stock is allocated FEFO.
 */

export type InventoryLotStatus = "received" | "quarantined" | "released" | "recalled" | "depleted";
export type InventoryReservationStatus = "active" | "consumed" | "released";
export type InventoryMovementType =
  | "receive"
  | "release"
  | "reserve"
  | "release_reservation"
  | "consume"
  | "adjust"
  | "expire";

export interface InventoryLot {
  id: string;
  productId: string;
  sizeId: string;
  lotCode: string;
  /** Net sellable quantity: receipts minus active reservations. */
  quantityOnHand: number;
  /** ISO date (YYYY-MM-DD) — best-before; lots on/past this date never sell. */
  expiryDate: string;
  status: InventoryLotStatus;
  releasedAt: string | null;
  releaseReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryReservation {
  id: string;
  orderId: string;
  lotId: string;
  productId: string;
  sizeId: string;
  quantity: number;
  status: InventoryReservationStatus;
  reason: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  lotId: string;
  productId: string;
  sizeId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  orderId: string | null;
  reason: string | null;
  occurredAt: string;
}

/** A lot is sellable only when released, unexpired and in stock. */
export function lotIsSellable(lot: InventoryLot, onDate: string): boolean {
  if (lot.status !== "released") return false;
  if (lot.quantityOnHand <= 0) return false;
  return lot.expiryDate > onDate.slice(0, 10);
}

/** FEFO ordering: earliest expiry first (ties broken by lot code). */
export function fefoOrder(a: InventoryLot, b: InventoryLot): number {
  return a.expiryDate.localeCompare(b.expiryDate) || a.lotCode.localeCompare(b.lotCode);
}

/** Aggregates lines by product/size so reservation math is per-SKU. */
export function aggregateLineQuantities(
  lines: Array<{ productId: string; sizeId: string; quantity: number }>,
): Array<{ productId: string; sizeId: string; quantity: number }> {
  const totals = new Map<string, { productId: string; sizeId: string; quantity: number }>();
  for (const line of lines) {
    const key = `${line.productId}\u0000${line.sizeId}`;
    const current = totals.get(key);
    if (current) current.quantity += line.quantity;
    else totals.set(key, { productId: line.productId, sizeId: line.sizeId, quantity: line.quantity });
  }
  return [...totals.values()];
}
