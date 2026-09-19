import { eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { ConversationState } from "@yubie/domain";
import type { Database } from "../client.js";
import { conversationSessions } from "../schema/index.js";

let sessionCounter = 0;

export class PostgresConversationSessionRepository {
  constructor(private readonly database: Database) {}

  async getByChatwootId(chatwootConversationId: string) {
    const rows = await this.database.db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.chatwootConversationId, chatwootConversationId))
      .limit(1);
    const row = rows[0];
    if (!row) return ok(null);
    return ok({
      id: row.id,
      chatwootConversationId: row.chatwootConversationId,
      chatwootContactId: row.chatwootContactId,
      inboxId: row.inboxId,
      state: row.state as ConversationState,
      currentIntent: row.currentIntent,
      customerType: row.customerType,
      lastActivityAt: row.lastActivityAt,
    });
  }

  async upsert(session: {
    chatwootConversationId: string;
    chatwootContactId: string;
    inboxId: string;
    state: ConversationState;
    currentIntent?: string;
    lastActivityAt: string;
    createdAt: string;
    updatedAt: string;
  }) {
    const existing = await this.getByChatwootId(session.chatwootConversationId);
    if (existing.ok && existing.value) {
      await this.database.db
        .update(conversationSessions)
        .set({
          state: session.state,
          currentIntent: session.currentIntent ?? null,
          lastActivityAt: session.lastActivityAt,
          updatedAt: session.updatedAt,
        })
        .where(eq(conversationSessions.id, existing.value.id));
      return ok(existing.value.id);
    }
    sessionCounter += 1;
    const id = `session-${sessionCounter}`;
    await this.database.db.insert(conversationSessions).values({
      id,
      chatwootConversationId: session.chatwootConversationId,
      chatwootContactId: session.chatwootContactId,
      inboxId: session.inboxId,
      state: session.state,
      currentIntent: session.currentIntent ?? null,
      lastActivityAt: session.lastActivityAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
    return ok(id);
  }

  async updateState(chatwootConversationId: string, state: ConversationState, updatedAt: string) {
    await this.database.db
      .update(conversationSessions)
      .set({ state, updatedAt })
      .where(eq(conversationSessions.chatwootConversationId, chatwootConversationId));
    return ok(undefined);
  }
}
