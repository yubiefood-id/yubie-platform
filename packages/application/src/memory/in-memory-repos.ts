import { ok, type ListingHealthCheck, type MarketplaceListing, type OutboundIntent, type WhatsAppIntent } from "@yubie/domain";
import type {
  AttributionPolicy,
  Clock,
  IdGenerator,
  ListingHealthRepository,
  MarketplaceListingRepository,
  OutboundIntentRepository,
  OperatorTaskRepository,
  WhatsAppIntentRepository,
} from "../ports.js";

export class InMemoryMarketplaceListingRepository implements MarketplaceListingRepository {
  private readonly items = new Map<string, MarketplaceListing>();

  constructor(seed: MarketplaceListing[] = []) {
    for (const item of seed) this.items.set(item.listingKey, item);
  }

  async findByKey(listingKey: string) {
    return ok(this.items.get(listingKey) ?? null);
  }

  async findActiveByProduct(productId: string) {
    return ok([...this.items.values()].filter((item) => item.productId === productId && item.status === "active"));
  }

  async listAll() {
    return ok([...this.items.values()]);
  }

  async save(listing: MarketplaceListing) {
    this.items.set(listing.listingKey, listing);
    return ok(undefined);
  }
}

export class InMemoryWhatsAppIntentRepository implements WhatsAppIntentRepository {
  private readonly items = new Map<string, WhatsAppIntent>();

  constructor(seed: WhatsAppIntent[] = []) {
    for (const item of seed) this.items.set(item.intentKey, item);
  }

  async findByKey(intentKey: string) {
    return ok(this.items.get(intentKey) ?? null);
  }

  async findActiveByProduct(productId: string) {
    return ok([...this.items.values()].filter((item) => item.productId === productId && item.status === "active"));
  }
}

export class InMemoryOutboundIntentRepository implements OutboundIntentRepository {
  readonly events: OutboundIntent[] = [];

  async append(intent: OutboundIntent) {
    this.events.push(intent);
    return ok(undefined);
  }
}

export class InMemoryListingHealthRepository implements ListingHealthRepository {
  readonly checks: ListingHealthCheck[] = [];

  async record(check: ListingHealthCheck) {
    this.checks.push(check);
    return ok(undefined);
  }

  async latestForListing(listingKey: string) {
    const latest = [...this.checks].reverse().find((item) => item.listingKey === listingKey) ?? null;
    return ok(latest);
  }
}

export class InMemoryOperatorTaskRepository implements OperatorTaskRepository {
  readonly tasks: Array<{ type: string; status: string; priority: number; listingKey?: string; details?: string; createdAt: string }> = [];

  async create(task: { type: string; status: string; priority: number; listingKey?: string; details?: string; createdAt: string }) {
    this.tasks.push(task);
    return ok(undefined);
  }
}

export class FixedClock implements Clock {
  constructor(private readonly iso: string) {}
  now() {
    return this.iso;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  nextId() {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class AllowlistAttributionPolicy implements AttributionPolicy {
  private readonly allowedSources = new Set(["homepage", "shop", "product_detail", "product_card", "header", "footer"]);
  private readonly allowedCampaigns = new Set(["organic", "launch", "recipe", "b2b"]);
  private readonly allowedPlacements = new Set(["hero", "card", "pdp", "shop_grid"]);

  sanitize(input: Partial<import("@yubie/domain").AttributionContext>) {
    const sanitized: import("@yubie/domain").AttributionContext = {};
    if (input.source && this.allowedSources.has(input.source) && input.source.length <= 40) sanitized.source = input.source;
    if (input.campaign && this.allowedCampaigns.has(input.campaign) && input.campaign.length <= 40) sanitized.campaign = input.campaign;
    if (input.placement && this.allowedPlacements.has(input.placement) && input.placement.length <= 40) sanitized.placement = input.placement;
    if (input.productId && input.productId.length <= 40) sanitized.productId = input.productId;
    if (input.rootId && input.rootId.length <= 40) sanitized.rootId = input.rootId;
    return ok(sanitized);
  }
}
