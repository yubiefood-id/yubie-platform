import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { assistantOutbox } from "../schema/index.js";

export type OutboxStatus = "pending" | "delivering" | "delivered" | "retry" | "ambiguous" | "failed";

export class PostgresAssistantOutboxRepository {
  constructor(private readonly database: Database) {}

  async enqueue(entry: {
    id?: string;
    runId?: string;
    provider?: string;
    providerThreadId?: string;
    conversationRef: string;
    actionType: string;
    payloadFingerprint: string;
    payloadJson: string;
    createdAt: string;
  }) {
    const existing = await this.database.db
      .select()
      .from(assistantOutbox)
      .where(
        and(
          eq(assistantOutbox.conversationRef, entry.conversationRef),
          eq(assistantOutbox.payloadFingerprint, entry.payloadFingerprint),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return ok({ status: "duplicate" as const, id: existing[0]!.id });
    }

    const id = entry.id ?? `outbox-${randomUUID()}`;
    await this.database.db.insert(assistantOutbox).values({
      id,
      runId: entry.runId ?? null,
      provider: entry.provider ?? "chatwoot",
      providerThreadId: entry.providerThreadId ?? entry.conversationRef,
      conversationRef: entry.conversationRef,
      actionType: entry.actionType,
      payloadFingerprint: entry.payloadFingerprint,
      payloadJson: entry.payloadJson,
      status: "pending",
      attemptCount: 0,
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
    });
    return ok({ status: "inserted" as const, id });
  }

  async claimPending(limit = 10) {
    const rows = await this.database.db
      .select()
      .from(assistantOutbox)
      .where(inArray(assistantOutbox.status, ["pending", "retry"]))
      .limit(limit);
    return rows;
  }

  async updateStatus(
    id: string,
    status: OutboxStatus,
    fields: {
      lastError?: string;
      providerExternalId?: string;
      providerMessageId?: string;
      deliveredAt?: string;
      attemptCount?: number;
    },
    updatedAt: string,
  ) {
    const update: Record<string, unknown> = {
      status,
      lastError: fields.lastError ?? null,
      providerExternalId: fields.providerExternalId ?? null,
      providerMessageId: fields.providerMessageId ?? null,
      deliveredAt: fields.deliveredAt ?? null,
      updatedAt,
    };
    if (fields.attemptCount !== undefined) {
      update.attemptCount = fields.attemptCount;
    }
    await this.database.db.update(assistantOutbox).set(update).where(eq(assistantOutbox.id, id));
    return ok(undefined);
  }
}
