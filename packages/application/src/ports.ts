import type {
  AttributionContext,
  AuthSession,
  ListingHealthCheck,
  MarketplaceListing,
  OrderRecord,
  OutboundIntent,
  PaymentEventRecord,
  PaymentProviderKind,
  PaymentRecord,
  Result,
  UseCaseResult,
  UserAccount,
  WhatsAppIntent,
} from "@yubie/domain";

export interface MarketplaceListingRepository {
  findByKey(listingKey: string): Promise<UseCaseResult<MarketplaceListing | null>>;
  findActiveByProduct(productId: string): Promise<UseCaseResult<MarketplaceListing[]>>;
  listAll(): Promise<UseCaseResult<MarketplaceListing[]>>;
  save(listing: MarketplaceListing): Promise<UseCaseResult<void>>;
}

export interface WhatsAppIntentRepository {
  findByKey(intentKey: string): Promise<UseCaseResult<WhatsAppIntent | null>>;
  findActiveByProduct(productId: string): Promise<UseCaseResult<WhatsAppIntent[]>>;
}

export interface OutboundIntentRepository {
  append(intent: OutboundIntent): Promise<UseCaseResult<void>>;
}

export interface ListingHealthRepository {
  record(check: ListingHealthCheck): Promise<UseCaseResult<void>>;
  latestForListing(listingKey: string): Promise<UseCaseResult<ListingHealthCheck | null>>;
}

export interface AuditRepository {
  append(event: { action: string; resourceType: string; resourceId: string; actor: string; occurredAt: string }): Promise<UseCaseResult<void>>;
}

export interface OperatorTaskRepository {
  create(task: { type: string; status: string; priority: number; listingKey?: string; details?: string; createdAt: string }): Promise<UseCaseResult<void>>;
}

export interface OutboxRepository {
  enqueue(event: { eventType: string; aggregateType: string; aggregateId: string; dedupeKey: string; payloadJson: string; availableAt: string }): Promise<UseCaseResult<void>>;
}

export interface RedirectAllowlistPolicy {
  isAllowedUrl(url: string, marketplace: string): boolean;
  isAllowedHost(hostname: string): boolean;
}

export interface AttributionPolicy {
  sanitize(input: Partial<AttributionContext>): UseCaseResult<AttributionContext>;
}

export interface LinkHealthChecker {
  check(url: string): Promise<UseCaseResult<ListingHealthCheck>>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  nextId(): string;
}

export interface HealthProbe {
  check(): Promise<Result<{ ready: boolean; details?: Record<string, string> }>>;
}

// --- ADR-012: first-party commerce (Xendit) + Google identity ports ---

export type PaymentEventAppendOutcome = "inserted" | "duplicate";

export interface OrderRepository {
  findById(id: string): Promise<UseCaseResult<OrderRecord | null>>;
  findByCheckoutRef(checkoutRef: string): Promise<UseCaseResult<OrderRecord | null>>;
  listForUser(userId: string): Promise<UseCaseResult<OrderRecord[]>>;
  save(order: OrderRecord): Promise<UseCaseResult<void>>;
}

export interface PaymentRepository {
  findById(id: string): Promise<UseCaseResult<PaymentRecord | null>>;
  findByProviderSession(provider: PaymentProviderKind, providerSessionId: string): Promise<UseCaseResult<PaymentRecord | null>>;
  findByOrderId(orderId: string): Promise<UseCaseResult<PaymentRecord[]>>;
  save(payment: PaymentRecord): Promise<UseCaseResult<void>>;
}

export interface PaymentEventRepository {
  recordOnce(event: PaymentEventRecord): Promise<UseCaseResult<PaymentEventAppendOutcome>>;
  listForPayment(paymentId: string): Promise<UseCaseResult<PaymentEventRecord[]>>;
}

export interface PaymentSessionHandle {
  provider: PaymentProviderKind;
  providerSessionId: string;
  redirectUrl: string;
  rawStatus: string;
  expiresAt: string | null;
}

export interface CreatePaymentSessionInput {
  referenceId: string;
  amount: number;
  currency: "IDR";
  customerEmail: string;
  description: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
  expiresAt?: string;
  items: Array<{ referenceId: string; name: string; quantity: number; netUnitAmount: number }>;
}

/** Provider-neutral payment boundary. Xendit specifics never cross it. */
export interface PaymentProviderPort {
  createPaymentSession(input: CreatePaymentSessionInput): Promise<UseCaseResult<PaymentSessionHandle>>;
  getPaymentSession(providerSessionId: string): Promise<UseCaseResult<PaymentSessionHandle | null>>;
  cancelPaymentSession(providerSessionId: string): Promise<UseCaseResult<{ accepted: boolean }>>;
}

export interface UserRepository {
  findByGoogleSub(googleSub: string): Promise<UseCaseResult<UserAccount | null>>;
  findById(id: string): Promise<UseCaseResult<UserAccount | null>>;
  save(user: UserAccount): Promise<UseCaseResult<void>>;
}

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<UseCaseResult<AuthSession | null>>;
  save(session: AuthSession): Promise<UseCaseResult<void>>;
  listForUser(userId: string): Promise<UseCaseResult<AuthSession[]>>;
}

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
}

/** Verifies a Google ID token (signature, issuer, audience, expiry). */
export interface GoogleCredentialVerifier {
  verify(idToken: string): Promise<UseCaseResult<GoogleIdentity>>;
}

export interface SessionTokenService {
  issue(): { token: string; tokenHash: string };
  hash(token: string): string;
}

export * from "./ports/support-conversation-provider.js";
