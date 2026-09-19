import { ok, type OutboundIntent } from "@yubie/domain";
import type { OutboundIntentRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { outboundClicks } from "../schema/index.js";

export class PostgresOutboundIntentRepository implements OutboundIntentRepository {
  constructor(private readonly database: Database) {}

  async append(intent: OutboundIntent) {
    await this.database.db.insert(outboundClicks).values({
      id: intent.id,
      listingId: intent.listingId ?? null,
      productId: intent.productId ?? null,
      skuId: intent.skuId ?? null,
      destinationKind: intent.destinationKind,
      channel: intent.channel,
      listingKey: intent.listingKey ?? null,
      intentKey: intent.intentKey ?? null,
      source: intent.attribution.source ?? null,
      campaign: intent.attribution.campaign ?? null,
      placement: intent.attribution.placement ?? null,
      rootId: intent.attribution.rootId ?? null,
      requestId: intent.requestId,
      createdAt: intent.createdAt,
    });
    return ok(undefined);
  }
}
