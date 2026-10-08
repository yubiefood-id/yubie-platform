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
  findByPublicToken(token: string): Promise<UseCaseResult<OrderRecord | null>>;
  listForUser(userId: string): Promise<UseCaseResult<OrderRecord[]>>;
  /** Draft orders older than the cutoff — reconciliation cleanup candidates. */
  listStaleDrafts(olderThan: string, limit: number): Promise<UseCaseResult<OrderRecord[]>>;
  save(order: OrderRecord): Promise<UseCaseResult<void>>;
}

export interface PaymentRepository {
  findById(id: string): Promise<UseCaseResult<PaymentRecord | null>>;
  /**
   * Loads a payment WITH a row lock inside the caller's transaction (Postgres
   * SELECT ... FOR UPDATE) so concurrent webhook/poll transitions serialize
   * on the row instead of racing last-writer-wins.
   */
  lockById(id: string): Promise<UseCaseResult<PaymentRecord | null>>;
  findByProviderSession(provider: PaymentProviderKind, providerSessionId: string): Promise<UseCaseResult<PaymentRecord | null>>;
  findByOrderId(orderId: string): Promise<UseCaseResult<PaymentRecord[]>>;
  /** Still-pending payments past expiry — reconciliation poll candidates. */
  listPendingExpired(now: string, limit: number): Promise<UseCaseResult<PaymentRecord[]>>;
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
  /** Provider business id observed on the session (webhook cross-check defence). */
  providerBusinessId?: string | null;
  /** Provider payment id once the session has captured a payment. */
  providerPaymentId?: string | null;
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

/**
 * Provider-neutral payment boundary. Xendit specifics never cross it.
 *
 * Error contract for createPaymentSession — callers depend on it:
 *  - err code "validation": the provider DEFINITIVELY refused the create
 *    (4xx). No payment session exists; nobody can be charged.
 *  - err code "timeout" / "unavailable": transport failure, timeout, or a
 *    provider 5xx. The outcome is AMBIGUOUS — a session may exist at the
 *    provider. Callers must never blind-retry the create.
 */
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

// --- Transactional boundary (AGENTS.md §5: state + audit + outbox COMMIT) ---

export interface IdempotencyClaim {
  scope: string;
  principalKey: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  createdAt: string;
}

export type IdempotencyClaimOutcome =
  | { status: "claimed" }
  | { status: "duplicate"; responseJson: string | null };

/**
 * Claims an idempotency key for (scope, principal, operation). Replaying the
 * same key with the same request hash reports "duplicate" (with the stored
 * first response once attached); the same key with a different request is a
 * conflict, never a silent re-execute.
 */
export interface IdempotencyRepository {
  claim(record: IdempotencyClaim): Promise<UseCaseResult<IdempotencyClaimOutcome>>;
  /** Stores the first response so replays can return it verbatim. */
  attachResponse(record: Omit<IdempotencyClaim, "createdAt" | "requestHash">, responseJson: string): Promise<UseCaseResult<void>>;
  /**
   * Removes a claim whose attempt created no durable order (rollback parity
   * for transaction managers without real rollback). Idempotent no-op when
   * the claim is absent.
   */
  releaseClaim(record: Omit<IdempotencyClaim, "createdAt" | "requestHash">): Promise<UseCaseResult<void>>;
}

export type WebhookInboxAppendOutcome = "inserted" | "duplicate";

export interface WebhookInboxRecordInput {
  provider: string;
  deliveryId: string;
  payloadHash: string;
  eventType: string;
  receivedAt: string;
}

/**
 * Durable inbox append (AGENTS.md §5 inbound pattern): the unique
 * (provider, delivery_id) index makes a redelivery a duplicate, and because
 * the append shares the processing transaction, a crash before COMMIT leaves
 * no inbox row — the provider redelivers cleanly.
 */
export interface WebhookInboxRepository {
  recordProcessed(input: WebhookInboxRecordInput): Promise<UseCaseResult<WebhookInboxAppendOutcome>>;
}

// --- Lot-aware inventory (FEFO, no oversell) ---

export interface InventoryReserveLine {
  productId: string;
  sizeId: string;
  quantity: number;
}

export interface InventoryReserveInput {
  orderId: string;
  lines: InventoryReserveLine[];
  now: string;
  /** When the reservation auto-expires (order payment window). */
  expiresAt: string;
}

export type InventoryReserveOutcome = { reserved: true } | { reserved: false; reason: "insufficient"; productId: string; sizeId: string };

/**
 * Thrown by InventoryRepository.reserveForOrder when sellable stock cannot
 * cover a line. Throwing (rather than returning) aborts the surrounding
 * checkout transaction, so no draft order survives an inventory failure.
 */
export class InsufficientInventoryError extends Error {
  constructor(
    readonly productId: string,
    readonly sizeId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Insufficient sellable inventory for ${productId}/${sizeId}: requested ${requested}, sellable ${available}`);
    this.name = "InsufficientInventoryError";
  }
}

/**
 * Transactional inventory core. reserveForOrder allocates FEFO across
 * released, unexpired lots and MUST run inside the checkout transaction: a
 * failure (insufficient sellable stock) rolls the whole checkout back. Lots
 * are locked so concurrent checkouts cannot oversell.
 */
export interface InventoryRepository {
  reserveForOrder(input: InventoryReserveInput): Promise<UseCaseResult<InventoryReserveOutcome>>;
  /** Releases the order's active reservations and restores lot quantities exactly once. */
  releaseForOrder(orderId: string, reason: string, now: string): Promise<UseCaseResult<{ released: number }>>;
  /**
   * Marks the order's active reservations consumed on confirmed payment. The
   * quantity was already deducted from the lot at reservation time — consume
   * NEVER touches stock again; it closes the lifecycle and writes the
   * "consume" movement for lot traceability.
   */
  consumeForOrder(orderId: string, now: string): Promise<UseCaseResult<{ consumed: number }>>;
  /** Sellable (released, unexpired, in-stock) lots for a SKU, FEFO order. */
  listSellable(productId: string, sizeId: string, onDate: string): Promise<UseCaseResult<import("@yubie/domain").InventoryLot[]>>;
}

// --- Growth + consent (newsletter / waitlist / B2B) ---

/**
 * Durable growth + consent storage. Every submission commits its business
 * row, a consent-ledger entry and (for B2B) an outbox event in ONE
 * transaction. Consent scopes are separate by design: a waitlist sign-up
 * records purpose "product_waitlist" and never implies marketing consent.
 */
export interface GrowthRepository {
  recordNewsletterConsent(submission: { email: string; name: string | null; source: string; consentVersion: string; consentedAt: string }): Promise<UseCaseResult<{ outcome: "subscribed" | "already_subscribed" }>>;
  recordWaitlistEntry(submission: { email: string; productId: string; source: string; consentVersion: string; consentedAt: string }): Promise<UseCaseResult<{ outcome: "joined" | "already_waiting" }>>;
  recordB2bLead(submission: {
    id: string;
    name: string;
    business: string;
    type: string;
    city: string;
    email: string;
    whatsapp: string;
    need: string | null;
    intent: string;
    interest: string;
    message: string | null;
    source: string;
    consentVersion: string;
    consentedAt: string;
  }): Promise<UseCaseResult<{ outcome: "created" }>>;
  appendConsent(entry: { id: string; subjectType: string; subjectKey: string; purpose: string; action: string; consentVersion: string; source: string; occurredAt: string }): Promise<UseCaseResult<null>>;
}

/** Repositories sharing one transaction, handed to TransactionManager work. */
export interface TransactionalRepositories {
  orders: OrderRepository;
  payments: PaymentRepository;
  paymentEvents: PaymentEventRepository;
  audit: AuditRepository;
  outbox: OutboxRepository;
  idempotency: IdempotencyRepository;
  inbox: WebhookInboxRepository;
  inventory: InventoryRepository;
  growth: GrowthRepository;
}

/**
 * Application-owned atomic write boundary: business state, audit and outbox
 * commit together or not at all. The provider-specific mechanism (PostgreSQL
 * BEGIN/COMMIT) stays inside @yubie/persistence — never in domain or use-case
 * code. External provider calls must happen OUTSIDE run().
 */
export interface TransactionManager {
  run<T>(operation: string, work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}

export * from "./ports/support-conversation-provider.js";
