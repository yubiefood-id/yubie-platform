import { sql } from "drizzle-orm";
import type { ShippingQuoteStore } from "@yubie/application";
import type { ShippingQuoteRecord, UseCaseResult } from "@yubie/domain";
import type { Database } from "../client.js";

/**
 * Transactional store for server-owned shipping quotes (ADR-014). A quote row
 * is the only shipping price authority at checkout: TX1 locks and consumes it
 * in the same transaction as the draft order, so a stale, replayed or tampered
 * selection can never price a second order.
 */
export class PostgresShippingQuoteRepository implements ShippingQuoteStore {
  constructor(private readonly database: Database) {}

  async insert(record: ShippingQuoteRecord): Promise<UseCaseResult<void>> {
    await this.database.db.execute(sql`INSERT INTO shipping_quotes
      (id,principal_key,cart_hash,destination_hash,origin_id,parcels_digest,courier_company,courier_service_code,courier_service_name,service_type,delivery_type,collection_method,offered_amount_idr,provider_amount_idr,subsidy_amount_idr,tax_amount_idr,tax_policy_version,status,valid_until,created_at)
      VALUES (${record.id},${record.principalKey},${record.cartHash},${record.destinationHash},${record.originId},${record.parcelsDigest},${record.courierCompany},${record.courierServiceCode},${record.courierServiceName ?? null},${record.serviceType ?? null},${record.deliveryType},'pickup',${record.offeredAmountIdr},${record.providerAmountIdr},${record.subsidyAmountIdr},${record.taxAmountIdr},${record.taxPolicyVersion},'quoted',${record.validUntil}::timestamptz,${record.createdAt}::timestamptz)`);
    return { ok: true, value: undefined };
  }

  async listUsable(input: { principalKey: string; cartHash: string; destinationHash: string; now: string }): Promise<UseCaseResult<ShippingQuoteRecord[]>> {
    const rows = await this.database.db.execute(sql`SELECT * FROM shipping_quotes
      WHERE principal_key=${input.principalKey} AND cart_hash=${input.cartHash} AND destination_hash=${input.destinationHash}
        AND status='quoted' AND valid_until>${input.now}::timestamptz
      ORDER BY offered_amount_idr ASC, created_at DESC`);
    return { ok: true, value: rows.map((row) => mapRow(row)) };
  }

  async findById(id: string, now: string): Promise<UseCaseResult<ShippingQuoteRecord | null>> {
    const rows = await this.database.db.execute(sql`SELECT * FROM shipping_quotes WHERE id=${id} AND status='quoted' AND valid_until>${now}::timestamptz LIMIT 1 FOR UPDATE`);
    const row = rows[0];
    return { ok: true, value: row ? mapRow(row) : null };
  }

  async consume(id: string, orderId: string, now: string): Promise<UseCaseResult<boolean>> {
    const rows = await this.database.db.execute(sql`UPDATE shipping_quotes SET status='consumed', consumed_at=${now}::timestamptz, order_id=${orderId}
      WHERE id=${id} AND status='quoted' AND valid_until>${now}::timestamptz RETURNING id`);
    return { ok: true, value: rows.length === 1 };
  }
}

type QuoteRow = {
  id: string; principal_key: string; cart_hash: string; destination_hash: string; origin_id: string; parcels_digest: string;
  courier_company: string; courier_service_code: string; courier_service_name: string | null; service_type: string | null;
  delivery_type: "now" | "scheduled"; offered_amount_idr: number; provider_amount_idr: number; subsidy_amount_idr: number;
  tax_amount_idr: number; tax_policy_version: string; valid_until: Date; created_at: Date; consumed_at: Date | null; order_id: string | null;
};

function mapRow(row: unknown): ShippingQuoteRecord {
  const r = row as QuoteRow;
  return {
    id: r.id,
    principalKey: r.principal_key,
    cartHash: r.cart_hash,
    destinationHash: r.destination_hash,
    originId: r.origin_id,
    parcelsDigest: r.parcels_digest,
    courierCompany: r.courier_company,
    courierServiceCode: r.courier_service_code,
    courierServiceName: r.courier_service_name,
    serviceType: r.service_type,
    deliveryType: r.delivery_type,
    offeredAmountIdr: r.offered_amount_idr,
    providerAmountIdr: r.provider_amount_idr,
    subsidyAmountIdr: r.subsidy_amount_idr,
    taxAmountIdr: r.tax_amount_idr,
    taxPolicyVersion: r.tax_policy_version,
    currency: "IDR",
    status: "quoted",
    validUntil: new Date(r.valid_until).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    consumedAt: r.consumed_at ? new Date(r.consumed_at).toISOString() : null,
    orderId: r.order_id,
  };
}
