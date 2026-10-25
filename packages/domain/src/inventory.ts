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

/** Approved packaging instruction. Components always name physical stock,
 * never another recipe; changing packaging requires a new approved version. */
export interface InventorySkuPolicy {
  productId: string;
  sizeId: string;
  version: number;
  approvalRef: string;
  components: Array<{ productId: string; sizeId: string; quantity: number }>;
}

function validPolicy(policy: InventorySkuPolicy): boolean {
  const known: Record<string,{sizeId:string;quantity:number}> = {
    "shake/pack-7":{sizeId:"sachet",quantity:7},
    "ppang/mini-pack-5":{sizeId:"mini",quantity:5},
    "mie/pack-3":{sizeId:"single",quantity:3},
  };
  const component=policy.components[0];
  const conversion=known[policy.productId+"/"+policy.sizeId];
  const packaging=policy.components.length===1 && component
    && ((component.sizeId===policy.sizeId&&component.quantity===1)
      || (conversion&&component.sizeId===conversion.sizeId&&component.quantity===conversion.quantity));
  return !!packaging && !!policy.approvalRef.trim() && Number.isSafeInteger(policy.version) && policy.version > 0
    && policy.components.length > 0 && policy.components.every(component =>
      component.productId === policy.productId && !!component.sizeId
      && Number.isSafeInteger(component.quantity) && component.quantity > 0);
}

export function expandInventoryDemand(lines: Array<{ productId: string; sizeId: string; quantity: number }>, policies: InventorySkuPolicy[]) {
  const demand = lines.flatMap(line => {
    const policy = policies.find(item => item.productId === line.productId && item.sizeId === line.sizeId);
    if (!policy) throw new Error(`Inventory configuration missing for ${line.productId}/${line.sizeId}`);
    if (!validPolicy(policy)) throw new Error("Invalid inventory component policy");
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new Error("Invalid inventory quantity");
    return policy.components.map(component => {
      const quantity = line.quantity * component.quantity;
      if (!Number.isSafeInteger(quantity)) throw new Error("Inventory component quantity overflow");
      return { productId: component.productId, sizeId: component.sizeId, quantity };
    });
  });
  return aggregateLineQuantities(demand).sort((a,b) => a.productId.localeCompare(b.productId) || a.sizeId.localeCompare(b.sizeId));
}

export function inventoryCapacity(policy: InventorySkuPolicy, physical: Array<{ productId: string; sizeId: string; quantity: number }>): number {
  if (!validPolicy(policy)) return 0;
  return Math.min(...aggregateLineQuantities(policy.components).map(component => {
    const available = physical.find(row => row.productId === component.productId && row.sizeId === component.sizeId)?.quantity ?? 0;
    return Math.max(0, Math.floor(available / component.quantity));
  }));
}
