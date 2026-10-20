import type { ErpStockReader, ErpStockReadResult } from "@yubie/application";
import type { ErpNextShadowClient } from "./shadow-client.js";

const PAGE_LIMIT = 500;

/**
 * Reads ERPNext `Bin.actual_qty` for mapped items in one warehouse through the
 * GET-only shadow client. The mapped warehouse must be the released (QA
 * passed) warehouse; quarantine warehouses are never mapped.
 */
export class ErpNextStockReader implements ErpStockReader {
  constructor(private readonly client: ErpNextShadowClient) {}

  async readReleasedStock(itemCodes: readonly string[], warehouse: string): Promise<ErpStockReadResult> {
    if (itemCodes.length === 0) return { ok: true, value: [] };
    if (itemCodes.length > PAGE_LIMIT) return { ok: false, code: "invalid_response" };
    const params = new URLSearchParams({
      fields: JSON.stringify(["item_code", "actual_qty"]),
      filters: JSON.stringify([["item_code", "in", itemCodes], ["warehouse", "=", warehouse]]),
      limit_page_length: String(PAGE_LIMIT + 1),
    });
    const read = await this.client.read(`/api/resource/Bin?${params.toString()}`);
    if (!read.ok) return { ok: false, code: "unavailable" };
    return parseBins(read.value);
  }
}

function parseBins(body: unknown): ErpStockReadResult {
  if (typeof body !== "object" || body === null || !("data" in body) || !Array.isArray(body.data)) {
    return { ok: false, code: "invalid_response" };
  }
  if (body.data.length > PAGE_LIMIT) return { ok: false, code: "invalid_response" };
  const lines = [];
  for (const row of body.data as unknown[]) {
    if (typeof row !== "object" || row === null || !("item_code" in row) || !("actual_qty" in row)) {
      return { ok: false, code: "invalid_response" };
    }
    const { item_code: sku, actual_qty: quantity } = row;
    if (typeof sku !== "string" || typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0) {
      return { ok: false, code: "invalid_response" };
    }
    lines.push({ sku, quantity });
  }
  return { ok: true, value: lines };
}
