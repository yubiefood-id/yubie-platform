import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { SupportPriority } from "@yubie/domain";
import type { Database } from "../client.js";
import { prioritySupportTasks } from "../schema/index.js";

export interface PriorityTaskRecord {
  id: string;
  provider: string;
  providerThreadId: string;
  ticketId: string;
  sourceOutboxId: string;
  priority: SupportPriority;
  groupId: string | null;
  reason: string;
  nextActionAt: string;
  ackAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * WA-02: internal triage projection for human-first handoffs. Zammad remains
 * the authority for ticket ownership and assignment; this row exists so the
 * ops surface can show priority, due time and acknowledgement evidence
 * (GOAL_PLAN G-E). Exactly-once per delivered handoff action via
 * source_outbox_id uniqueness.
 */
export class PostgresPrioritySupportTaskRepository {
  constructor(private readonly database: Database) {}

  async recordHandoff(input: {
    provider: string;
    providerThreadId: string;
    ticketId: string;
    sourceOutboxId: string;
    priority: SupportPriority;
    groupId?: string;
    reason: string;
    nextActionAt: string;
    at: string;
  }) {
    const inserted = await this.database.db
      .insert(prioritySupportTasks)
      .values({
        id: `prio_${randomUUID()}`,
        provider: input.provider,
        providerThreadId: input.providerThreadId,
        ticketId: input.ticketId,
        sourceOutboxId: input.sourceOutboxId,
        priority: input.priority,
        groupId: input.groupId ?? null,
        reason: input.reason,
        nextActionAt: input.nextActionAt,
        createdAt: input.at,
        updatedAt: input.at,
      })
      .onConflictDoNothing({ target: prioritySupportTasks.sourceOutboxId })
      .returning({ id: prioritySupportTasks.id });
    return ok({ inserted: inserted.length === 1 });
  }

  async openByThread(provider: string, providerThreadId: string) {
    const rows = await this.database.db
      .select()
      .from(prioritySupportTasks)
      .where(
        and(
          eq(prioritySupportTasks.provider, provider),
          eq(prioritySupportTasks.providerThreadId, providerThreadId),
          isNull(prioritySupportTasks.resolvedAt),
        ),
      );
    return ok(rows.map((row) => this.mapRow(row)));
  }

  async markAcknowledged(provider: string, providerThreadId: string, at: string) {
    const rows = await this.database.db
      .update(prioritySupportTasks)
      .set({ ackAt: at, updatedAt: at })
      .where(
        and(
          eq(prioritySupportTasks.provider, provider),
          eq(prioritySupportTasks.providerThreadId, providerThreadId),
          isNull(prioritySupportTasks.ackAt),
          isNull(prioritySupportTasks.resolvedAt),
        ),
      )
      .returning({ id: prioritySupportTasks.id });
    return ok(rows.length);
  }

  async openSummary() {
    const byPriority = await this.database.db
      .select({ priority: prioritySupportTasks.priority, count: sql<number>`count(*)::int` })
      .from(prioritySupportTasks)
      .where(isNull(prioritySupportTasks.resolvedAt))
      .groupBy(prioritySupportTasks.priority);
    const unacknowledged = await this.database.db
      .select({
        count: sql<number>`count(*)::int`,
        oldestAgeSeconds: sql<number>`coalesce(max(extract(epoch from now() - ${prioritySupportTasks.createdAt}))::int, 0)`,
      })
      .from(prioritySupportTasks)
      .where(and(isNull(prioritySupportTasks.resolvedAt), isNull(prioritySupportTasks.ackAt)));
    return ok({
      byPriority,
      unacknowledged: unacknowledged[0]?.count ?? 0,
      oldestUnacknowledgedAgeSeconds: unacknowledged[0]?.oldestAgeSeconds ?? 0,
    });
  }

  private mapRow(row: typeof prioritySupportTasks.$inferSelect): PriorityTaskRecord {
    return {
      id: row.id,
      provider: row.provider,
      providerThreadId: row.providerThreadId,
      ticketId: row.ticketId,
      sourceOutboxId: row.sourceOutboxId,
      priority: row.priority as SupportPriority,
      groupId: row.groupId,
      reason: row.reason,
      nextActionAt: row.nextActionAt,
      ackAt: row.ackAt,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
    };
  }
}
