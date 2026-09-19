import { and, eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { ConversationState } from "@yubie/domain";
import type { Database } from "../client.js";
import { conversationSessions } from "../schema/index.js";

let sessionCounter = 0;

export class PostgresConversationSessionRepository {
  constructor(private readonly database: Database) {}

  async getByProviderThreadId(provider: string, providerThreadId: string) {
    const rows = await this.database.db
      .select()
      .from(conversationSessions)
      .where(
        and(
          eq(conversationSessions.provider, provider),
          eq(conversationSessions.providerThreadId, providerThreadId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return ok(null);
    return ok(this.mapRow(row));
  }

  async getByChatwootId(chatwootConversationId: string) {
    const rows = await this.database.db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.chatwootConversationId, chatwootConversationId))
      .limit(1);
    const row = rows[0];
    if (!row) return ok(null);
    return ok(this.mapRow(row));
  }

  private mapRow(row: typeof conversationSessions.$inferSelect) {
    return {
      id: row.id,
      provider: row.provider,
      providerThreadId: row.providerThreadId ?? row.chatwootConversationId,
      providerCustomerId: row.providerCustomerId ?? row.chatwootContactId,
      chatwootConversationId: row.chatwootConversationId,
      chatwootContactId: row.chatwootContactId,
      inboxId: row.inboxId,
      state: row.state as ConversationState,
      currentIntent: row.currentIntent,
      customerType: row.customerType,
      lastActivityAt: row.lastActivityAt,
    };
  }

  async upsert(session: {
    provider: string;
    providerThreadId: string;
    providerCustomerId: string;
    providerInboxOrChannelId: string;
    providerLastMessageId?: string;
    chatwootConversationId?: string;
    chatwootContactId?: string;
    inboxId: string;
    state: ConversationState;
    currentIntent?: string;
    lastActivityAt: string;
    createdAt: string;
    updatedAt: string;
  }) {
    const existing = await this.getByProviderThreadId(session.provider, session.providerThreadId);
    if (existing.ok && existing.value) {
      await this.database.db
        .update(conversationSessions)
        .set({
          state: session.state,
          currentIntent: session.currentIntent ?? null,
          lastActivityAt: session.lastActivityAt,
          updatedAt: session.updatedAt,
          ...(session.providerLastMessageId ? { providerLastMessageId: session.providerLastMessageId } : {}),
        })
        .where(eq(conversationSessions.id, existing.value.id));
      return ok(existing.value.id);
    }
    sessionCounter += 1;
    const id = `session-${sessionCounter}`;
    await this.database.db.insert(conversationSessions).values({
      id,
      provider: session.provider,
      providerThreadId: session.providerThreadId,
      providerCustomerId: session.providerCustomerId,
      providerInboxOrChannelId: session.providerInboxOrChannelId,
      providerLastMessageId: session.providerLastMessageId ?? null,
      chatwootConversationId: session.chatwootConversationId ?? session.providerThreadId,
      chatwootContactId: session.chatwootContactId ?? session.providerCustomerId,
      inboxId: session.inboxId,
      state: session.state,
      currentIntent: session.currentIntent ?? null,
      lastActivityAt: session.lastActivityAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
    return ok(id);
  }

  async updateState(provider: string, providerThreadId: string, state: ConversationState, updatedAt: string) {
    await this.database.db
      .update(conversationSessions)
      .set({ state, updatedAt })
      .where(
        and(
          eq(conversationSessions.provider, provider),
          eq(conversationSessions.providerThreadId, providerThreadId),
        ),
      );
    return ok(undefined);
  }

  async updateStateByChatwootId(chatwootConversationId: string, state: ConversationState, updatedAt: string) {
    await this.database.db
      .update(conversationSessions)
      .set({ state, updatedAt })
      .where(eq(conversationSessions.chatwootConversationId, chatwootConversationId));
    return ok(undefined);
  }
}
