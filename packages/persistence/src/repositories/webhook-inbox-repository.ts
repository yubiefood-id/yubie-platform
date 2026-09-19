import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { webhookInbox } from "../schema/index.js";

const RAW_BODY_TTL_HOURS = 72;

export class PostgresWebhookInboxRepository {
  constructor(private readonly database: Database) {}

  async insert(event: {
    provider: string;
    deliveryId?: string;
    dedupeKey?: string;
    eventType: string;
    providerEventType?: string;
    payloadHash: string;
    rawBody?: string;
    conversationRef?: string;
    messageRef?: string;
    contactRef?: string;
    inboxRef?: string;
    providerTimestamp?: string;
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

    const id = `inbox-${randomUUID()}`;
    const expiresAt = event.rawBody
      ? new Date(Date.now() + RAW_BODY_TTL_HOURS * 60 * 60 * 1000).toISOString()
      : undefined;

    await this.database.db.insert(webhookInbox).values({
      id,
      provider: event.provider,
      deliveryId: event.deliveryId ?? null,
      dedupeKey: event.dedupeKey ?? event.deliveryId ?? null,
      eventType: event.eventType,
      providerEventType: event.providerEventType ?? null,
      payloadHash: event.payloadHash,
      conversationRef: event.conversationRef ?? null,
      messageRef: event.messageRef ?? null,
      contactRef: event.contactRef ?? null,
      inboxRef: event.inboxRef ?? null,
      providerTimestamp: event.providerTimestamp ?? null,
      rawBody: event.rawBody ?? null,
      rawBodyExpiresAt: expiresAt ?? null,
      status: "received",
      receivedAt: event.receivedAt,
      attemptCount: 0,
    });
    return ok({ status: "inserted" as const, id });
  }

  async markProcessing(id: string) {
    await this.database.db
      .update(webhookInbox)
      .set({ status: "processing" })
      .where(eq(webhookInbox.id, id));
    return ok(undefined);
  }

  async markProcessed(id: string, processedAt: string) {
    await this.database.db
      .update(webhookInbox)
      .set({ status: "processed", processedAt, rawBody: null, rawBodyExpiresAt: null })
      .where(eq(webhookInbox.id, id));
    return ok(undefined);
  }

  async markFailed(id: string, error: string) {
    await this.database.db
      .update(webhookInbox)
      .set({ status: "failed", lastError: error })
      .where(eq(webhookInbox.id, id));
    return ok(undefined);
  }

  async purgeExpiredRawBodies(now: string) {
    await this.database.db
      .update(webhookInbox)
      .set({ rawBody: null, rawBodyExpiresAt: null })
      .where(and(isNotNull(webhookInbox.rawBody), lt(webhookInbox.rawBodyExpiresAt, now)));
    return ok(undefined);
  }
}
