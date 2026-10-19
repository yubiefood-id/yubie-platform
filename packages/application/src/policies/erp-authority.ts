/**
 * Yubie checkout owns short-lived reservations. ERPNext is not a second
 * writable stock master until a recorded reconciliation proves one owner.
 * The literal `false` is the gate: a future change has to edit this function
 * and its tests before any ERP stock write can compile as allowed.
 */
export function erpStockWriteDecision(): { allowed: false; reason: "dual_master_unproven" } {
  return { allowed: false, reason: "dual_master_unproven" };
}
