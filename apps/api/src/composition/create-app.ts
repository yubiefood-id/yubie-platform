import {
  AllowlistAttributionPolicy,
  FixedClock,
  InMemoryMarketplaceListingRepository,
  InMemoryOutboundIntentRepository,
  InMemoryWhatsAppIntentRepository,
  SequentialIdGenerator,
  type HealthProbe,
} from "@yubie/application";
import { DefaultRedirectAllowlistPolicy } from "@yubie/integrations";
import {
  createDatabase,
  PostgresHealthProbe,
  PostgresMarketplaceListingRepository,
  PostgresOutboundIntentRepository,
  PostgresWhatsAppIntentRepository,
} from "@yubie/persistence";
import type { MarketplaceListing } from "@yubie/domain";

export interface AppContext {
  listings: InMemoryMarketplaceListingRepository | PostgresMarketplaceListingRepository;
  whatsapp: InMemoryWhatsAppIntentRepository | PostgresWhatsAppIntentRepository;
  outbound: InMemoryOutboundIntentRepository | PostgresOutboundIntentRepository;
  allowlist: DefaultRedirectAllowlistPolicy;
  attribution: AllowlistAttributionPolicy;
  clock: FixedClock;
  ids: SequentialIdGenerator;
  healthProbe: HealthProbe;
  releaseSha: string;
}

const STATIC_ACTIVE_LISTING: MarketplaceListing = {
  id: "lst-static-1",
  listingKey: "yubie-flour-250",
  marketplace: "shopee",
  shopKey: "yubie-official",
  productId: "flour",
  skuId: "250g",
  publicUrl: "https://shopee.co.id/yubie-flour-250",
  status: "active",
  verifiedAt: "2026-01-01T00:00:00.000Z",
  verifiedBy: "static-fixture",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export function createAppContext(): AppContext {
  const releaseSha = process.env.RELEASE_SHA ?? "dev";
  const source = process.env.PURCHASE_OPTIONS_SOURCE ?? (process.env.DATABASE_URL ? "database" : "static");
  const clock = new FixedClock(new Date().toISOString());
  const ids = new SequentialIdGenerator();

  if (source === "database" && process.env.DATABASE_URL) {
    const database = createDatabase(process.env.DATABASE_URL);
    return {
      listings: new PostgresMarketplaceListingRepository(database),
      whatsapp: new PostgresWhatsAppIntentRepository(database),
      outbound: new PostgresOutboundIntentRepository(database),
      allowlist: new DefaultRedirectAllowlistPolicy(),
      attribution: new AllowlistAttributionPolicy(),
      clock,
      ids,
      healthProbe: new PostgresHealthProbe(database),
      releaseSha,
    };
  }

  return {
    listings: new InMemoryMarketplaceListingRepository([STATIC_ACTIVE_LISTING]),
    whatsapp: new InMemoryWhatsAppIntentRepository(),
    outbound: new InMemoryOutboundIntentRepository(),
    allowlist: new DefaultRedirectAllowlistPolicy(),
    attribution: new AllowlistAttributionPolicy(),
    clock,
    ids,
    healthProbe: {
      async check() {
        return { ok: true, value: { ready: true, details: { mode: "static" } } };
      },
    },
    releaseSha,
  };
}
