import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { assistantOutbox, conversationFlowState, conversationSessions, webhookInbox } from "./schema/index.js";

/** Keeps PostgreSQL locks and transaction handles inside persistence. */
export function withAssistantTransaction<T>(database: Database, work: (bound: Database) => Promise<T>, lock?: string): Promise<T> {
  return database.db.transaction(async tx => {
    if (lock) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))`);
    return work({ db: tx, client: database.client } as unknown as Database);
  });
}

export class PostgresAssistantWorkRepository {
  constructor(private readonly database: Database) {}

  async inboxById(id: string) {
    return (await this.database.db.select().from(webhookInbox).where(eq(webhookInbox.id,id)).limit(1))[0];
  }

  async pendingConversation(provider: string, threadId: string) {
    return this.database.db.select().from(webhookInbox).where(and(eq(webhookInbox.provider,provider),eq(webhookInbox.conversationRef,threadId),sql`${webhookInbox.status}<>'processed'`))
      .orderBy(sql`CASE WHEN ${webhookInbox.messageRef} IS NULL THEN 0 ELSE 1 END`,sql`CASE WHEN ${webhookInbox.messageRef} ~ '^[0-9]+$' THEN ${webhookInbox.messageRef}::numeric END`,webhookInbox.receivedAt,webhookInbox.id).limit(100);
  }

  async processingFailed(id: string) {
    const rows=await this.database.db.update(webhookInbox).set({attemptCount:sql`${webhookInbox.attemptCount}+1`,status:"failed",lastError:"ASSISTANT_PROCESSING_FAILED"}).where(and(eq(webhookInbox.id,id),sql`${webhookInbox.status}<>'processed'`)).returning();
    return rows[0];
  }

  async backlog(provider: string) {
    return this.database.db.select({id:webhookInbox.id}).from(webhookInbox).where(and(eq(webhookInbox.provider,provider),inArray(webhookInbox.status,["received","processing","failed"]),sql`${webhookInbox.attemptCount}<5`)).orderBy(webhookInbox.receivedAt).limit(50);
  }

  async clearContext(provider: string, threadId: string) {
    await this.database.db.update(conversationFlowState).set({contextJsonb:{}}).where(and(eq(conversationFlowState.provider,provider),eq(conversationFlowState.providerThreadId,threadId)));
  }

  async consumeRelease(provider: string, threadId: string) {
    await this.database.db.update(conversationSessions).set({botReleasedAt:null}).where(and(eq(conversationSessions.provider,provider),eq(conversationSessions.providerThreadId,threadId)));
  }

  async completeHandoff(id: string, provider: string, threadId: string, at: string) {
    await withAssistantTransaction(this.database,async bound=>{
      await bound.db.update(assistantOutbox).set({status:"delivered",deliveredAt:at,updatedAt:at,leaseUntil:null,payloadJson:sql`(${assistantOutbox.payloadJson}::jsonb - 'summary')::text`}).where(eq(assistantOutbox.id,id));
      await bound.db.update(conversationSessions).set({state:"QUEUED",updatedAt:at}).where(and(eq(conversationSessions.provider,provider),eq(conversationSessions.providerThreadId,threadId),eq(conversationSessions.state,"HANDOFF_REQUESTED")));
    });
  }

  async purgeExpiredContext() {
    await this.database.db.update(conversationFlowState).set({contextJsonb:{},nodeId:sql`CASE WHEN flow_version='deterministic-v2' THEN 'HOME' ELSE 'home' END`,fallbackCount:0}).where(sql`updated_at < now()-interval '72 hours' AND context_jsonb<>'{}'::jsonb`);
    await this.database.db.update(assistantOutbox).set({payloadJson:sql`(payload_json::jsonb - 'summary')::text`}).where(sql`created_at < now()-interval '72 hours' AND payload_json::jsonb ? 'summary'`);
  }
}
