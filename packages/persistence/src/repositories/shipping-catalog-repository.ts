import { sql } from "drizzle-orm";
import type { ShippingOriginReader, SkuShippingProfileReader } from "@yubie/application";
import type { SkuShippingProfileRecord, SkuStorageClass } from "@yubie/domain";
import type { Database } from "../client.js";

/**
 * Read-only access to operator-approved shipping origins and SKU logistics
 * profiles (ADR-014 step 1). No PII beyond the origin record itself leaves
 * the server; these reads feed server-side rate quoting only.
 */
export class PostgresShippingCatalogRepository implements ShippingOriginReader, SkuShippingProfileReader {
  constructor(private readonly database: Database) {}

  async findActive(now: string) {
    const rows = await this.database.db.execute(sql`SELECT id,postal_code,latitude,longitude FROM shipping_origins
      WHERE is_active=true ORDER BY version DESC, updated_at DESC LIMIT 1`);
    const row = rows[0] as { id: string; postal_code: string | null; latitude: number | null; longitude: number | null } | undefined;
    return row ? { id: row.id, postalCode: row.postal_code, latitude: row.latitude, longitude: row.longitude } : null;
  }

  async findEffective(skus: readonly string[], now: string): Promise<SkuShippingProfileRecord[]> {
    if (skus.length === 0) return [];
    const rows = await this.database.db.execute(sql`SELECT DISTINCT ON (sku) * FROM sku_shipping_profiles
      WHERE sku = ANY(${sql.param(skus as string[])}::text[]) AND effective_from<=${now}::timestamptz AND (effective_to IS NULL OR effective_to>${now}::timestamptz)
      ORDER BY sku, effective_from DESC`);
    return rows.map((row) => {
      const r = row as {
        id: string; sku: string; weight_grams: number; length_cm: number | null; width_cm: number | null; height_cm: number | null;
        packaging: string | null; storage_class: SkuStorageClass; handling_notes: string | null;
        effective_from: Date; effective_to: Date | null; version: number; created_at: Date;
      };
      return {
        id: r.id,
        sku: r.sku,
        weightGrams: r.weight_grams,
        lengthCm: r.length_cm,
        widthCm: r.width_cm,
        heightCm: r.height_cm,
        packaging: r.packaging,
        storageClass: r.storage_class,
        handlingNotes: r.handling_notes,
        effectiveFrom: new Date(r.effective_from).toISOString(),
        effectiveTo: r.effective_to ? new Date(r.effective_to).toISOString() : null,
        version: r.version,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }
}
