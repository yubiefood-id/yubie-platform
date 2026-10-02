import {
  AllowlistAttributionPolicy,
  CryptoIdGenerator,
  CryptoSessionTokenService,
  InMemoryAuditRepository,
  InMemoryGrowthRepository,
  InMemoryIdempotencyRepository,
  InMemoryInventoryRepository,
  InMemoryMarketplaceListingRepository,
  InMemoryOrderRepository,
  InMemoryOutboundIntentRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentEventRepository,
  InMemoryPaymentRepository,
  InMemorySessionRepository,
  InMemoryTransactionManager,
  InMemoryUserRepository,
  InMemoryWebhookInboxRepository,
  InMemoryWhatsAppIntentRepository,
  SystemClock,
  type Clock,
  type GoogleCredentialVerifier,
  type HealthProbe,
  type IdGenerator,
  type OrderRepository,
  type PaymentEventRepository,
  type PaymentProviderPort,
  type PaymentRepository,
  type SessionRepository,
  type TransactionManager,
  type UserRepository,
} from "@yubie/application";
import {
  inspectCommerceRuntimeConfig,
  parseCommerceRuntimeConfig,
  type CommerceRuntimeConfig,
} from "@yubie/config";
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
  PostgresTransactionManager,
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
  clock: Clock;
  ids: IdGenerator;
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
  /** Expected Xendit business_id for webhook validation (ADR-012 §5). */
  xenditBusinessId: string | null;
  /** "lots" gates checkout on released, unexpired lot stock. */
  inventoryMode: "none" | "lots";
  /** Configured public origin (APP_ORIGIN) — cookie Secure + return URLs. */
  appOrigin: string | null;
  verifier: GoogleCredentialVerifier | null;
  googleClientId: string | null;
  tx: TransactionManager;
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

/**
 * Readiness never reports ready from a fallback that cannot really serve: the
 * underlying dependency probe must pass AND the commerce configuration must
 * still validate (a drift that would fail startup must also fail readyz).
 */
function commerceReadinessProbe(inner: HealthProbe, commerce: CommerceRuntimeConfig): HealthProbe {
  return {
    async check() {
      const result = await inner.check();
      if (!result.ok) return result;
      // Re-validate configuration on every readiness read: a drift that would
      // fail startup must also fail readiness — never report ready from a
      // fallback that cannot really serve.
      const inspection = inspectCommerceRuntimeConfig(process.env);
      const ready = result.value.ready && inspection.ok;
      return {
        ok: true,
        value: {
          ready,
          details: {
            ...result.value.details,
            commerceProvider: commerce.provider,
          },
        },
      };
    },
  };
}

const STATIC_PROBE: HealthProbe = {
  async check() {
    return { ok: true, value: { ready: true, details: { mode: "static" } } };
  },
};

export function createAppContext(): AppContext {
  const releaseSha = process.env.RELEASE_SHA ?? "dev";
  // Fail closed (CONFIG_ERROR) before any repository is built: enum typos and
  // half-configured payments must stop startup instead of degrading to a
  // fallback mode. @yubie/config owns the whole commerce env contract.
  const commerce = parseCommerceRuntimeConfig(process.env);
  const clock: Clock = new SystemClock();
  const ids: IdGenerator = new CryptoIdGenerator();
  const tokens = new CryptoSessionTokenService();

  const paymentMode = commerce.provider === "xendit" ? "xendit" : "preview";
  const paymentProvider = paymentMode === "xendit"
    ? new XenditPaymentProvider({
        secretKey: process.env.XENDIT_SECRET_KEY ?? "",
        ...(process.env.XENDIT_API_BASE_URL ? { apiBaseUrl: process.env.XENDIT_API_BASE_URL } : {}),
      })
    : null;

  const googleClientId = process.env.GOOGLE_CLIENT_ID ?? null;
  const verifier = googleClientId ? new GoogleIdTokenVerifier({ clientId: googleClientId }) : null;
  const webhookToken = process.env.XENDIT_WEBHOOK_TOKEN ?? null;
  const xenditBusinessId = process.env.XENDIT_BUSINESS_ID ?? null;

  const databaseUrl = process.env.DATABASE_URL;
  // PURCHASE_OPTIONS_SOURCE governs the listings source only. First-party
  // transactional state (orders, payments, users, sessions) is durable
  // whenever real payments are enabled — it must never follow the listings
  // flag into memory. parseCommerceRuntimeConfig guarantees DATABASE_URL is
  // present before this branch is taken in xendit mode.
  const listingsFromDatabase = commerce.purchaseOptionsSource === "database";
  const transactionalFromDatabase = paymentMode === "xendit" || listingsFromDatabase;

  if (databaseUrl && (listingsFromDatabase || transactionalFromDatabase)) {
    const database = createDatabase(databaseUrl);
    const transactional = transactionalFromDatabase;
    const transactionalOrders = transactional ? new PostgresOrderRepository(database) : new InMemoryOrderRepository();
    const transactionalPayments = transactional ? new PostgresPaymentRepository(database) : new InMemoryPaymentRepository();
    const transactionalPaymentEvents = transactional ? new PostgresPaymentEventRepository(database) : new InMemoryPaymentEventRepository();
    const transactionalUsers = transactional ? new PostgresUserRepository(database) : new InMemoryUserRepository();
    const transactionalSessions = transactional ? new PostgresSessionRepository(database) : new InMemorySessionRepository();
    return {
      listings: listingsFromDatabase
        ? new PostgresMarketplaceListingRepository(database)
        : new InMemoryMarketplaceListingRepository([STATIC_ACTIVE_LISTING]),
      whatsapp: listingsFromDatabase ? new PostgresWhatsAppIntentRepository(database) : new InMemoryWhatsAppIntentRepository(),
      outbound: listingsFromDatabase ? new PostgresOutboundIntentRepository(database) : new InMemoryOutboundIntentRepository(),
      allowlist: new DefaultRedirectAllowlistPolicy(),
      attribution: new AllowlistAttributionPolicy(),
      clock,
      ids,
      healthProbe: transactional
        ? commerceReadinessProbe(new PostgresHealthProbe(database), commerce)
        : commerceReadinessProbe(STATIC_PROBE, commerce),
      releaseSha,
      orders: transactionalOrders,
      payments: transactionalPayments,
      paymentEvents: transactionalPaymentEvents,
      users: transactionalUsers,
      authSessions: transactionalSessions,
      tokens,
      paymentMode,
      paymentProvider,
      webhookToken,
      xenditBusinessId,
      inventoryMode: commerce.inventoryMode,
      appOrigin: commerce.appOrigin,
      verifier,
      googleClientId,
      tx: transactional
        ? new PostgresTransactionManager(database)
        : new InMemoryTransactionManager({
            orders: transactionalOrders,
            payments: transactionalPayments,
            paymentEvents: transactionalPaymentEvents,
            audit: new InMemoryAuditRepository(),
            outbox: new InMemoryOutboxRepository(),
            idempotency: new InMemoryIdempotencyRepository(),
            inbox: new InMemoryWebhookInboxRepository(),
            inventory: new InMemoryInventoryRepository(),
            growth: new InMemoryGrowthRepository(),
          }),
    };
  }

  const orders = new InMemoryOrderRepository();
  const payments = new InMemoryPaymentRepository();
  const paymentEvents = new InMemoryPaymentEventRepository();
  const audit = new InMemoryAuditRepository();
  const outbox = new InMemoryOutboxRepository();
  const idempotency = new InMemoryIdempotencyRepository();
  return {
    listings: new InMemoryMarketplaceListingRepository([STATIC_ACTIVE_LISTING]),
    whatsapp: new InMemoryWhatsAppIntentRepository(),
    outbound: new InMemoryOutboundIntentRepository(),
    allowlist: new DefaultRedirectAllowlistPolicy(),
    attribution: new AllowlistAttributionPolicy(),
    clock,
    ids,
    healthProbe: commerceReadinessProbe(STATIC_PROBE, commerce),
    releaseSha,
    orders,
    payments,
    paymentEvents,
    users: new InMemoryUserRepository(),
    authSessions: new InMemorySessionRepository(),
    tokens,
    paymentMode,
    paymentProvider,
    webhookToken,
    xenditBusinessId,
    verifier,
    googleClientId,
    tx: new InMemoryTransactionManager({ orders, payments, paymentEvents, audit, outbox, idempotency, inbox: new InMemoryWebhookInboxRepository(), inventory: new InMemoryInventoryRepository(), growth: new InMemoryGrowthRepository() }),
    inventoryMode: commerce.inventoryMode,
    appOrigin: commerce.appOrigin,
  };
}

export type { Clock, IdGenerator };
