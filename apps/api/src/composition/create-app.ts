import {
  AllowlistAttributionPolicy,
  CryptoSessionTokenService,
  FixedClock,
  InMemoryMarketplaceListingRepository,
  InMemoryOrderRepository,
  InMemoryOutboundIntentRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InMemoryWhatsAppIntentRepository,
  SequentialIdGenerator,
  type Clock,
  type GoogleCredentialVerifier,
  type HealthProbe,
  type IdGenerator,
  type OrderRepository,
  type PaymentEventRepository,
  type PaymentProviderPort,
  type PaymentRepository,
  type SessionRepository,
  type UserRepository,
} from "@yubie/application";
import { DefaultRedirectAllowlistPolicy, GoogleIdTokenVerifier, XenditPaymentProvider } from "@yubie/integrations";
import {
  createDatabase,
  PostgresHealthProbe,
  PostgresMarketplaceListingRepository,
  PostgresOrderRepository,
  PostgresOutboundIntentRepository,
  PostgresPaymentEventRepository,
  PostgresPaymentRepository,
  PostgresSessionRepository,
  PostgresUserRepository,
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
  // ADR-012: first-party commerce + identity.
  orders: OrderRepository;
  payments: PaymentRepository;
  paymentEvents: PaymentEventRepository;
  users: UserRepository;
  authSessions: SessionRepository;
  tokens: CryptoSessionTokenService;
  paymentMode: "preview" | "xendit";
  paymentProvider: PaymentProviderPort | null;
  webhookToken: string | null;
  verifier: GoogleCredentialVerifier | null;
  googleClientId: string | null;
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
  const tokens = new CryptoSessionTokenService();

  // COMMERCE_PROVIDER=xendit activates first-party payments. The secret key
  // is required fail-closed: a typo must stop startup, never fall back to a
  // fake provider that pretends payments work.
  const paymentMode = process.env.COMMERCE_PROVIDER === "xendit" ? "xendit" : "preview";
  if (paymentMode === "xendit" && !process.env.XENDIT_SECRET_KEY) {
    throw new Error("COMMERCE_PROVIDER=xendit requires XENDIT_SECRET_KEY (TEST-mode key first; ADR-012).");
  }
  const paymentProvider = paymentMode === "xendit"
    ? new XenditPaymentProvider({
        secretKey: process.env.XENDIT_SECRET_KEY ?? "",
        ...(process.env.XENDIT_API_BASE_URL ? { apiBaseUrl: process.env.XENDIT_API_BASE_URL } : {}),
      })
    : null;

  const googleClientId = process.env.GOOGLE_CLIENT_ID ?? null;
  const verifier = googleClientId ? new GoogleIdTokenVerifier({ clientId: googleClientId }) : null;
  const webhookToken = process.env.XENDIT_WEBHOOK_TOKEN ?? null;

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
      orders: new PostgresOrderRepository(database),
      payments: new PostgresPaymentRepository(database),
      paymentEvents: new PostgresPaymentEventRepository(database),
      users: new PostgresUserRepository(database),
      authSessions: new PostgresSessionRepository(database),
      tokens,
      paymentMode,
      paymentProvider,
      webhookToken,
      verifier,
      googleClientId,
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
    orders: new InMemoryOrderRepository(),
    payments: new InMemoryPaymentRepository(),
    paymentEvents: new InMemoryPaymentEventRepository(),
    users: new InMemoryUserRepository(),
    authSessions: new InMemorySessionRepository(),
    tokens,
    paymentMode,
    paymentProvider,
    webhookToken,
    verifier,
    googleClientId,
  };
}

export type { Clock, IdGenerator };
