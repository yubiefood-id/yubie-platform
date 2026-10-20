import { erpStockWriteDecision, stockDiscrepancyReport, type StockDiscrepancy, type StockQuantityLine } from "../policies/erp-authority.js";
import type { OutboxRepository } from "../ports.js";

/** One Yubie sellable size mapped to exactly one ERPNext item in one warehouse. */
export interface ErpItemMapping {
  productId: string;
  sizeId: string;
  erpItemCode: string;
  warehouse: string;
}

export type ErpStockReadResult =
  | { ok: true; value: StockQuantityLine[] }
  | { ok: false; code: "unavailable" | "invalid_response" };

export interface ErpStockReader {
  /** Released on-hand quantity per ERP item code. Read-only. */
  readReleasedStock(itemCodes: readonly string[], warehouse: string): Promise<ErpStockReadResult>;
}

export interface YubieStockReader {
  /** Sellable on-hand quantity per Yubie product size. */
  readSellableStock(): Promise<Array<{ productId: string; sizeId: string; quantity: number }>>;
}

export type ErpShadowReconcileOutcome =
  | { status: "reported"; discrepancies: StockDiscrepancy[]; mismatched: number }
  | { status: "retry"; attempt: number; delayMs: number; code: string }
  | { status: "dead_letter"; attempt: number; code: string };

const ITEM_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,139}$/;
const WAREHOUSE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,139}$/;
export const ERP_SHADOW_MAX_ATTEMPTS = 6;

/** Rejects ambiguous mappings: every size and every item code must be unique. */
export function validateErpMappings(mappings: readonly ErpItemMapping[]): ErpItemMapping[] {
  const sizes = new Set<string>();
  const codes = new Set<string>();
  for (const mapping of mappings) {
    if (!ITEM_CODE.test(mapping.erpItemCode)) throw new RangeError(`invalid ERP item code for ${mapping.productId}/${mapping.sizeId}`);
    if (!WAREHOUSE.test(mapping.warehouse)) throw new RangeError(`invalid ERP warehouse for ${mapping.productId}/${mapping.sizeId}`);
    const size = `${mapping.productId}/${mapping.sizeId}`;
    if (sizes.has(size)) throw new RangeError(`duplicate mapping for ${size}`);
    if (codes.has(mapping.erpItemCode)) throw new RangeError(`ERP item ${mapping.erpItemCode} is mapped twice`);
    sizes.add(size);
    codes.add(mapping.erpItemCode);
  }
  return [...mappings];
}

/** Exponential backoff: 1 min, 2, 4, 8, 16, capped at 30 min. */
export function erpShadowRetryDelayMs(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(attempt - 1, 0), 30 * 60_000);
}

/**
 * Compares Yubie sellable stock with ERPNext released stock and reports the
 * difference. It never adjusts either side: there is no write port, and it
 * refuses to run if the ERP stock write gate is ever opened without a review
 * of this use case.
 */
export async function runErpShadowReconcile(input: {
  mappings: readonly ErpItemMapping[];
  erp: ErpStockReader;
  yubie: YubieStockReader;
  outbox: OutboxRepository;
  attempt: number;
  runId: string;
  now: string;
}): Promise<ErpShadowReconcileOutcome> {
  if (erpStockWriteDecision().allowed) throw new Error("ERP shadow reconcile must be reviewed before ERP stock writes are enabled");
  const mappings = validateErpMappings(input.mappings);

  const byWarehouse = new Map<string, string[]>();
  for (const mapping of mappings) byWarehouse.set(mapping.warehouse, [...(byWarehouse.get(mapping.warehouse) ?? []), mapping.erpItemCode]);

  const erpLines: StockQuantityLine[] = [];
  for (const [warehouse, codes] of byWarehouse) {
    const read = await input.erp.readReleasedStock(codes, warehouse);
    if (!read.ok) return failure(input, read.code);
    const allowed = new Set(codes);
    for (const line of read.value) {
      if (!allowed.has(line.sku)) return failure(input, "invalid_response");
      erpLines.push(line);
    }
  }

  const codeBySize = new Map(mappings.map((mapping) => [`${mapping.productId}/${mapping.sizeId}`, mapping.erpItemCode]));
  const yubieLines: StockQuantityLine[] = [];
  for (const row of await input.yubie.readSellableStock()) {
    const code = codeBySize.get(`${row.productId}/${row.sizeId}`);
    if (code) yubieLines.push({ sku: code, quantity: row.quantity });
  }

  const discrepancies = stockDiscrepancyReport(yubieLines, erpLines);
  const mismatched = discrepancies.filter((line) => line.delta !== 0).length;
  if (mismatched > 0) {
    const enqueued = await input.outbox.enqueue({
      eventType: "erp.stock_discrepancy_reported",
      aggregateType: "erp_shadow_run",
      aggregateId: input.runId,
      dedupeKey: `erp_shadow:${input.runId}:report`,
      payloadJson: JSON.stringify({ runId: input.runId, discrepancies: discrepancies.filter((line) => line.delta !== 0) }),
      availableAt: input.now,
    });
    if (!enqueued.ok) return failure(input, "outbox_unavailable");
  }
  return { status: "reported", discrepancies, mismatched };
}

async function failure(
  input: { attempt: number; runId: string; now: string; outbox: OutboxRepository },
  code: string,
): Promise<ErpShadowReconcileOutcome> {
  if (input.attempt < ERP_SHADOW_MAX_ATTEMPTS) {
    return { status: "retry", attempt: input.attempt + 1, delayMs: erpShadowRetryDelayMs(input.attempt), code };
  }
  const enqueued = await input.outbox.enqueue({
    eventType: "erp.shadow_reconcile_dead_letter",
    aggregateType: "erp_shadow_run",
    aggregateId: input.runId,
    dedupeKey: `erp_shadow:${input.runId}:dead_letter`,
    payloadJson: JSON.stringify({ runId: input.runId, attempt: input.attempt, code }),
    availableAt: input.now,
  });
  if (!enqueued.ok) throw new Error(`ERP shadow dead letter could not be recorded: ${code}`);
  return { status: "dead_letter", attempt: input.attempt, code };
}
