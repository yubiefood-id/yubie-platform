import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { assistantOutbox } from "../schema/index.js";

export type OutboxStatus = "pending" | "delivering" | "delivered" | "retry" | "ambiguous" | "failed" | "accepted" | "sent" | "cancelled";

export class PostgresAssistantOutboxRepository {
  constructor(private readonly database: Database) {}

  async enqueue(entry: {
    id?: string;
    runId?: string;
    dependsOnId?: string;
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
    const inserted=await this.database.db.insert(assistantOutbox).values({
      id,
      runId: entry.runId ?? null,
      dependsOnId: entry.dependsOnId ?? null,
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
    }).onConflictDoNothing().returning({id:assistantOutbox.id});
    if(!inserted.length) {
      const rows=await this.database.db.select({id:assistantOutbox.id}).from(assistantOutbox).where(and(eq(assistantOutbox.conversationRef,entry.conversationRef),eq(assistantOutbox.payloadFingerprint,entry.payloadFingerprint))).limit(1);
      return ok({status:"duplicate" as const,id:rows[0]!.id});
    }
    return ok({ status: "inserted" as const, id });
  }

  async listPending(limit = 100) {
    return this.database.db.select().from(assistantOutbox).where(inArray(assistantOutbox.status,["pending","retry"])).limit(limit);
  }

  async get(id: string) {
    return (await this.database.db.select().from(assistantOutbox).where(eq(assistantOutbox.id,id)).limit(1))[0];
  }

  async counts() {
    return this.database.db.select({status:assistantOutbox.status,count:sql<number>`count(*)::int`}).from(assistantOutbox).groupBy(assistantOutbox.status);
  }

  async reconciliationCandidates(provider: string) {
    return this.database.db.select().from(assistantOutbox).where(and(eq(assistantOutbox.provider,provider),inArray(assistantOutbox.status,["accepted","sent","ambiguous"]),sql`(${assistantOutbox.nextAttemptAt} IS NULL OR ${assistantOutbox.nextAttemptAt}<=now())`)).orderBy(sql`CASE WHEN payload_json::jsonb->>'intent'='FOOD_SAFETY' THEN 0 ELSE 1 END`,assistantOutbox.nextAttemptAt,assistantOutbox.createdAt).limit(20);
  }

  async retrySafetyHandoff(id: string) {
    const rows=await this.database.db.update(assistantOutbox).set({status:"retry",nextAttemptAt:new Date().toISOString()}).where(and(eq(assistantOutbox.id,id),eq(assistantOutbox.status,"ambiguous"),eq(assistantOutbox.actionType,"handoff"),sql`payload_json::jsonb->>'intent'='FOOD_SAFETY'`,sql`attempt_count<5`)).returning({id:assistantOutbox.id});
    return rows.length===1;
  }

  async cancelPendingCustomer(at: string) {
    await this.database.db.update(assistantOutbox).set({status:"cancelled",lastError:"automation_off",updatedAt:at}).where(and(inArray(assistantOutbox.status,["pending","retry"]),sql`NOT (action_type='handoff' AND payload_json::jsonb->>'intent'='FOOD_SAFETY')`));
  }

  async claimPending(limit = 10, id?: string, provider?: string) {
    return this.database.db.transaction(async tx=>{
      const rows=await tx.select().from(assistantOutbox).where(and(
        inArray(assistantOutbox.status,["pending","retry"]),
        sql`(${assistantOutbox.nextAttemptAt} IS NULL OR ${assistantOutbox.nextAttemptAt} <= now())`,
        sql`(${assistantOutbox.dependsOnId} IS NULL OR EXISTS (SELECT 1 FROM assistant_outbox prior WHERE prior.id = ${assistantOutbox.dependsOnId} AND prior.status = 'delivered'))`,
        // One customer effect per conversation may be in flight or unresolved.
        // Internal safety routing can always pass a blocked customer queue.
        sql`(${assistantOutbox.actionType}='handoff' OR NOT EXISTS (SELECT 1 FROM assistant_outbox prior WHERE prior.provider=${assistantOutbox.provider} AND prior.conversation_ref=${assistantOutbox.conversationRef} AND (prior.created_at,prior.id)<(${assistantOutbox.createdAt},${assistantOutbox.id}) AND prior.status IN ('pending','retry','delivering','accepted','sent','ambiguous')))`,
        ...(id?[eq(assistantOutbox.id,id)]:[]),
        ...(provider?[eq(assistantOutbox.provider,provider)]:[]),
      )).orderBy(assistantOutbox.createdAt,assistantOutbox.id).limit(limit).for("update",{skipLocked:true});
      if(!rows.length)return [];
      return tx.update(assistantOutbox).set({status:"delivering",attemptCount:sql`${assistantOutbox.attemptCount} + 1`,leaseUntil:sql`now() + interval '60 seconds'`,updatedAt:new Date().toISOString()}).where(inArray(assistantOutbox.id,rows.map(r=>r.id))).returning();
    });
  }

  async recoverExpiredClaims() {
    await this.database.db.update(assistantOutbox).set({status:"ambiguous",lastError:"dispatch_lease_expired",leaseUntil:null}).where(and(eq(assistantOutbox.status,"delivering"),sql`${assistantOutbox.leaseUntil} < now()`));
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
      nextAttemptAt?: string;
    },
    updatedAt: string,
  ) {
    const update: Record<string, unknown> = {status,updatedAt,leaseUntil:null};
    for(const [key,value] of Object.entries(fields))if(value!==undefined)update[key]=value;
    await this.database.db.update(assistantOutbox).set(update).where(eq(assistantOutbox.id, id));
    return ok(undefined);
  }
}
