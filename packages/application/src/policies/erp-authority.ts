/**
 * Yubie checkout owns short-lived reservations. ERPNext is not a second
 * writable stock master until a recorded reconciliation proves one owner.
 * The literal `false` is the gate: a future change has to edit this function
 * and its tests before any ERP stock write can compile as allowed.
 */
export function erpStockWriteDecision(): { allowed: false; reason: "dual_master_unproven" } {
  return { allowed: false, reason: "dual_master_unproven" };
}

export interface StockQuantityLine {
  sku: string;
  quantity: number;
}

export interface StockDiscrepancy {
  sku: string;
  yubie: number;
  erp: number;
  delta: number;
}

/**
 * Read-only comparison. A positive delta means Yubie is higher than ERPNext.
 * This function does not post a stock entry.
 */
export function stockDiscrepancyReport(yubie: readonly StockQuantityLine[], erp: readonly StockQuantityLine[]): StockDiscrepancy[] {
  const yubieBySku = sumBySku(yubie, "yubie");
  const erpBySku = sumBySku(erp, "erp");
  const skus = [...new Set([...yubieBySku.keys(), ...erpBySku.keys()])].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return skus.map((sku) => {
    const left = yubieBySku.get(sku) ?? 0;
    const right = erpBySku.get(sku) ?? 0;
    return { sku, yubie: left, erp: right, delta: left - right };
  });
}

function sumBySku(lines: readonly StockQuantityLine[], label: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.sku || !Number.isSafeInteger(line.quantity) || line.quantity < 0) {
      throw new RangeError(`${label} stock line is not a non-negative integer quantity`);
    }
    totals.set(line.sku, (totals.get(line.sku) ?? 0) + line.quantity);
  }
  return totals;
}
