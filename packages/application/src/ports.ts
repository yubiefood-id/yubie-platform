import type {
  AttributionContext,
  ListingHealthCheck,
  MarketplaceListing,
  OutboundIntent,
  Result,
  UseCaseResult,
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

export * from "./ports/support-conversation-provider.js";
