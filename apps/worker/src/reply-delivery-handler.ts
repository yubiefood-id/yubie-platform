import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { SupportConversationProvider, SupportThreadRef } from "@yubie/application";
import { buildHandoffCommand } from "@yubie/integrations";
import {
  assistantOutbox,
  PostgresAssistantOutboxRepository,
  PostgresConversationSessionRepository,
  type Database,
} from "@yubie/persistence";
import { increment, setGauge } from "./metrics.js";

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
    increment("human_takeover_total");
    await outboxRepo.updateStatus(outboxId, "failed", { lastError: "human_takeover" }, now);
    return;
  }

  const humanState = await support.getCurrentHumanState(ref);
  if (humanState.humanActive) {
    increment("human_takeover_total");
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
      increment("support_provider_request_total");
      const result = await support.sendReply({ threadRef: ref, content: payload.content, idempotencyKey });
      if (!result.ok) {
        if (result.code === "TIMEOUT") increment("support_provider_timeout_total");
        else increment("support_provider_error_total");
        const status = result.code === "TIMEOUT" || result.code === "AMBIGUOUS" ? "ambiguous" : "retry";
        if (status === "ambiguous") increment("assistant_outbox_ambiguous");
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
      increment("support_provider_request_total");
      increment("assistant_handoff_total");
      const result = await support.handoff(handoff);
      if (!result.ok) {
        if (result.code === "TIMEOUT") increment("support_provider_timeout_total");
        else increment("support_provider_error_total");
        const status = result.code === "TIMEOUT" || result.code === "AMBIGUOUS" ? "ambiguous" : "retry";
        if (status === "ambiguous") increment("assistant_outbox_ambiguous");
        await outboxRepo.updateStatus(outboxId, status, { lastError: result.message ?? result.code }, now);
        return;
      }
      await outboxRepo.updateStatus(outboxId, "delivered", { deliveredAt: now }, now);
    }
  } catch (error) {
    increment("support_provider_error_total");
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("timeout") ? "ambiguous" : "retry";
    if (status === "ambiguous") increment("assistant_outbox_ambiguous");
    await outboxRepo.updateStatus(outboxId, status, { lastError: message }, now);
    throw error;
  }
}

async function refreshOutboxGauges(database: Database) {
  const rows = await database.db
    .select({
      status: assistantOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(assistantOutbox)
    .groupBy(assistantOutbox.status);

  let pending = 0;
  let ambiguous = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "pending" || row.status === "retry" || row.status === "delivering") pending += row.count;
    if (row.status === "ambiguous") ambiguous += row.count;
    if (row.status === "failed") failed += row.count;
  }
  setGauge("assistant_outbox_pending", pending);
  setGauge("assistant_outbox_ambiguous", ambiguous);
  setGauge("assistant_outbox_failed", failed);
}

export async function processPendingOutbox(database: Database, support: SupportConversationProvider) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  const pending = await outboxRepo.claimPending(20);
  for (const row of pending) {
    await deliverSupportOutbox(database, support, row.id);
  }
  await refreshOutboxGauges(database);
}

export const deliverChatwootOutbox = deliverSupportOutbox;
