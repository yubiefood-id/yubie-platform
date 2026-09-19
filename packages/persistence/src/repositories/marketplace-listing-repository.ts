import { and, eq } from "drizzle-orm";
import { ok, type MarketplaceListing } from "@yubie/domain";
import type { MarketplaceListingRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { marketplaceListings } from "../schema/index.js";

export class PostgresMarketplaceListingRepository implements MarketplaceListingRepository {
  constructor(private readonly database: Database) {}

  async findByKey(listingKey: string) {
    const rows = await this.database.db.select().from(marketplaceListings).where(eq(marketplaceListings.listingKey, listingKey)).limit(1);
    return ok(rows[0] ? mapRow(rows[0]) : null);
  }

  async findActiveByProduct(productId: string) {
    const rows = await this.database.db
      .select()
      .from(marketplaceListings)
      .where(and(eq(marketplaceListings.productId, productId), eq(marketplaceListings.status, "active")));
    return ok(rows.map(mapRow));
  }

  async listAll() {
    const rows = await this.database.db.select().from(marketplaceListings);
    return ok(rows.map(mapRow));
  }

  async save(listing: MarketplaceListing) {
    await this.database.db.insert(marketplaceListings).values({
      id: listing.id,
      listingKey: listing.listingKey,
      marketplace: listing.marketplace,
      shopKey: listing.shopKey,
      productId: listing.productId,
      skuId: listing.skuId ?? null,
      externalListingId: listing.externalListingId ?? null,
      publicUrl: listing.publicUrl,
      status: listing.status,
      verifiedAt: listing.verifiedAt,
      verifiedBy: listing.verifiedBy,
      lastCheckedAt: listing.lastCheckedAt ?? null,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    }).onConflictDoUpdate({
      target: marketplaceListings.id,
      set: {
        publicUrl: listing.publicUrl,
        status: listing.status,
        lastCheckedAt: listing.lastCheckedAt ?? null,
        updatedAt: listing.updatedAt,
      },
    });
    return ok(undefined);
  }
}

function mapRow(row: typeof marketplaceListings.$inferSelect): MarketplaceListing {
  return {
    id: row.id,
    listingKey: row.listingKey,
    marketplace: row.marketplace,
    shopKey: row.shopKey,
    productId: row.productId,
    publicUrl: row.publicUrl,
    status: row.status,
    verifiedAt: row.verifiedAt,
    verifiedBy: row.verifiedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.skuId ? { skuId: row.skuId } : {}),
    ...(row.externalListingId ? { externalListingId: row.externalListingId } : {}),
    ...(row.lastCheckedAt ? { lastCheckedAt: row.lastCheckedAt } : {}),
  };
}
