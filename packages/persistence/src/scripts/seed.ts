import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
const now = new Date().toISOString();

async function seed() {
  await sql`
    INSERT INTO marketplace_listings (
      id, listing_key, marketplace, shop_key, product_id, sku_id, external_listing_id,
      public_url, status, verified_at, verified_by, created_at, updated_at
    ) VALUES (
      'lst-draft-1', 'yubie-flour-draft', 'shopee', 'yubie-official', 'flour', '250g', 'draft-001',
      'https://example.invalid/yubie-flour-draft', 'draft', ${now}, 'seed', ${now}, ${now}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO marketplace_listings (
      id, listing_key, marketplace, shop_key, product_id, sku_id, external_listing_id,
      public_url, status, verified_at, verified_by, created_at, updated_at
    ) VALUES (
      'lst-paused-1', 'yubie-flour-paused', 'tokopedia', 'yubie-official', 'flour', '250g', 'paused-001',
      'https://example.invalid/yubie-flour-paused', 'paused', ${now}, 'seed', ${now}, ${now}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  console.log("Synthetic seed complete (no ACTIVE production marketplace URLs)");
  await sql.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
