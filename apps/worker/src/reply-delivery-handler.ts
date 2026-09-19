import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ChatwootClient } from "@yubie/integrations";
import {
  assistantOutbox,
  PostgresAssistantOutboxRepository,
  PostgresConversationSessionRepository,
  type Database,
} from "@yubie/persistence";

export async function deliverChatwootOutbox(database: Database, chatwoot: ChatwootClient, outboxId: string) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  const sessions = new PostgresConversationSessionRepository(database);
  const rows = await database.db.select().from(assistantOutbox).where(eq(assistantOutbox.id, outboxId)).limit(1);

  const row = rows[0];
  if (!row || row.status === "delivered") return;

  const now = new Date().toISOString();
  await outboxRepo.updateStatus(outboxId, "delivering", { attemptCount: row.attemptCount + 1 }, now);

  const session = await sessions.getByChatwootId(row.conversationRef);
  if (session.ok && session.value?.state === "HUMAN_ACTIVE") {
    await outboxRepo.updateStatus(outboxId, "failed", { lastError: "human_takeover" }, now);
    return;
  }

  const cwStatus = await chatwoot.getConversationStatus(row.conversationRef);
  if (cwStatus.status === "open") {
    await outboxRepo.updateStatus(outboxId, "failed", { lastError: "human_takeover_chatwoot" }, now);
    return;
  }

  const payload = JSON.parse(row.payloadJson) as { content?: string; labels?: string[] };

  try {
    if (row.actionType === "reply" && payload.content) {
      const idempotencyKey = createHash("sha256").update(`${row.conversationRef}:${row.payloadFingerprint}`).digest("hex");
      await chatwoot.sendMessage(row.conversationRef, payload.content, idempotencyKey);
    } else if (row.actionType === "handoff") {
      await chatwoot.requestHandoff(row.conversationRef, payload.labels ?? ["human-required"]);
    }
    await outboxRepo.updateStatus(outboxId, "delivered", { deliveredAt: now }, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("timeout") ? "ambiguous" : "retry";
    await outboxRepo.updateStatus(outboxId, status, { lastError: message }, now);
    throw error;
  }
}

export async function processPendingOutbox(database: Database, chatwoot: ChatwootClient) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  const pending = await outboxRepo.claimPending(20);
  for (const row of pending) {
    await deliverChatwootOutbox(database, chatwoot, row.id);
  }
}
