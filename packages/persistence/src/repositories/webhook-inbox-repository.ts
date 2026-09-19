import { and, eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { webhookInbox } from "../schema/index.js";

let inboxCounter = 0;

export class PostgresWebhookInboxRepository {
  constructor(private readonly database: Database) {}

  async insert(event: {
    provider: string;
    deliveryId?: string;
    eventType: string;
    payloadHash: string;
    rawBody: string;
    receivedAt: string;
  }) {
    if (event.deliveryId) {
      const existing = await this.database.db
        .select()
        .from(webhookInbox)
        .where(and(eq(webhookInbox.provider, event.provider), eq(webhookInbox.deliveryId, event.deliveryId)))
        .limit(1);
      if (existing.length > 0) {
        return ok({ status: "duplicate" as const, id: existing[0]!.id });
      }
    }

    const hashExisting = await this.database.db
      .select()
      .from(webhookInbox)
      .where(and(eq(webhookInbox.provider, event.provider), eq(webhookInbox.payloadHash, event.payloadHash)))
      .limit(1);
    if (hashExisting.length > 0) {
      return ok({ status: "duplicate" as const, id: hashExisting[0]!.id });
    }

    inboxCounter += 1;
    const id = `inbox-${inboxCounter}`;
    await this.database.db.insert(webhookInbox).values({
      id,
      provider: event.provider,
      deliveryId: event.deliveryId ?? null,
      eventType: event.eventType,
      payloadHash: event.payloadHash,
      rawBody: event.rawBody,
      status: "received",
      receivedAt: event.receivedAt,
    });
    return ok({ status: "inserted" as const, id });
  }

  async markProcessed(id: string, processedAt: string) {
    await this.database.db.update(webhookInbox).set({ status: "processed", processedAt }).where(eq(webhookInbox.id, id));
    return ok(undefined);
  }
}
