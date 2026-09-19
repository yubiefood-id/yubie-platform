import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { SupportConversationProvider, SupportThreadRef } from "@yubie/application";
import { buildHandoffCommand } from "@yubie/integrations";
import {
  assistantOutbox,
  PostgresAssistantOutboxRepository,
  PostgresConversationSessionRepository,
  type Database,
} from "@yubie/persistence";

function threadRefFromRow(row: {
  provider: string;
  providerThreadId: string | null;
  conversationRef: string;
}): SupportThreadRef {
  return {
    provider: row.provider as SupportThreadRef["provider"],
    threadId: row.providerThreadId ?? row.conversationRef,
  };
}

export async function deliverSupportOutbox(
  database: Database,
  support: SupportConversationProvider,
  outboxId: string,
) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  const sessions = new PostgresConversationSessionRepository(database);
  const rows = await database.db.select().from(assistantOutbox).where(eq(assistantOutbox.id, outboxId)).limit(1);

  const row = rows[0];
  if (!row || row.status === "delivered") return;

  const now = new Date().toISOString();
  await outboxRepo.updateStatus(outboxId, "delivering", { attemptCount: row.attemptCount + 1 }, now);

  const ref = threadRefFromRow(row);
  const session = await sessions.getByProviderThreadId(ref.provider, ref.threadId);
  if (session.ok && session.value?.state === "HUMAN_ACTIVE") {
    await outboxRepo.updateStatus(outboxId, "failed", { lastError: "human_takeover" }, now);
    return;
  }

  const humanState = await support.getCurrentHumanState(ref);
  if (humanState.humanActive) {
    await outboxRepo.updateStatus(outboxId, "failed", { lastError: `human_takeover_${humanState.reason ?? "provider"}` }, now);
    return;
  }

  const payload = JSON.parse(row.payloadJson) as {
    content?: string;
    labels?: string[];
    intent?: string;
    handoffReason?: string;
    groupId?: string;
    priorityId?: string;
  };

  try {
    if (row.actionType === "reply" && payload.content) {
      const idempotencyKey = createHash("sha256").update(`${ref.threadId}:${row.payloadFingerprint}`).digest("hex");
      const result = await support.sendReply({ threadRef: ref, content: payload.content, idempotencyKey });
      if (!result.ok) {
        const status = result.code === "TIMEOUT" || result.code === "AMBIGUOUS" ? "ambiguous" : "retry";
        await outboxRepo.updateStatus(outboxId, status, { lastError: result.message ?? result.code }, now);
        return;
      }
      await outboxRepo.updateStatus(
        outboxId,
        "delivered",
        {
          deliveredAt: now,
          ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        },
        now,
      );
    } else if (row.actionType === "handoff") {
      const handoff =
        payload.intent
          ? buildHandoffCommand(ref, payload.intent as import("@yubie/domain").AssistantIntent, payload.handoffReason)
          : {
              threadRef: ref,
              labels: payload.labels ?? ["human-required"],
              ...(payload.groupId ? { groupId: payload.groupId } : {}),
              ...(payload.priorityId ? { priorityId: payload.priorityId } : {}),
            };
      const result = await support.handoff(handoff);
      if (!result.ok) {
        const status = result.code === "TIMEOUT" || result.code === "AMBIGUOUS" ? "ambiguous" : "retry";
        await outboxRepo.updateStatus(outboxId, status, { lastError: result.message ?? result.code }, now);
        return;
      }
      await outboxRepo.updateStatus(outboxId, "delivered", { deliveredAt: now }, now);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("timeout") ? "ambiguous" : "retry";
    await outboxRepo.updateStatus(outboxId, status, { lastError: message }, now);
    throw error;
  }
}

export async function processPendingOutbox(database: Database, support: SupportConversationProvider) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  const pending = await outboxRepo.claimPending(20);
  for (const row of pending) {
    await deliverSupportOutbox(database, support, row.id);
  }
}

export const deliverChatwootOutbox = deliverSupportOutbox;
