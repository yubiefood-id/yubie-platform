import { randomUUID, createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { aiUsagePeriods, aiUsageReservations } from "../schema/index.js";

export interface AIUsageLimits {
  maxCallsPerConversation: number;
  maxCallsPerContactDay: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  globalDayTokens: number;
  globalMonthCostMicrousd: number;
  priceMicrousdPerToken: number;
}

export type AIReservationDenied =
  | "policy_incomplete"
  | "conversation_call_cap"
  | "contact_day_cap"
  | "global_day_tokens"
  | "global_month_cost"
  | "concurrent_request"
  | "input_tokens_over_limit";

export type ReserveResult =
  | { ok: true; reserved: true; requestId: string; estimatedCostMicrousd: number }
  | { ok: true; reserved: false; requestId: string; reason: AIReservationDenied };

export function contactHashFor(provider: string, contactId: string): string {
  return createHash("sha256").update(`${provider}:${contactId}`).digest("hex");
}

export function dayKeyFor(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function monthKeyFor(at: Date): string {
  return at.toISOString().slice(0, 7);
}

const GLOBAL_SUBJECT = "global";

/**
 * WA-03: atomic AI budget reservation. Caps are checked and counters moved
 * inside one transaction that first takes an advisory lock on the contact, so
 * concurrent requests for the same contact serialize and can never overshoot
 * (GOAL_PLAN D06/D17). Reserved amounts count conservatively against caps;
 * actuals are reconciled exactly once via complete().
 */
export class PostgresAIUsageRepository {
  constructor(private readonly database: Database) {}

  async reserve(input: {
    requestId: string;
    contactHash: string;
    providerThreadId: string;
    model: string;
    priceVersion: string;
    estimatedInputTokens: number;
    limits: AIUsageLimits;
    at: Date;
  }): Promise<ReserveResult> {
    const limits = input.limits;
    if (limits.globalDayTokens <= 0 || limits.globalMonthCostMicrousd < 0) {
      return { ok: true, reserved: false, requestId: input.requestId, reason: "policy_incomplete" };
    }
    if (input.estimatedInputTokens > limits.maxInputTokens) {
      return { ok: true, reserved: false, requestId: input.requestId, reason: "input_tokens_over_limit" };
    }

    const dayKey = dayKeyFor(input.at);
    const monthKey = monthKeyFor(input.at);
    const reservedTokens = limits.maxInputTokens + limits.maxOutputTokens;
    const estimatedCost = Math.round(reservedTokens * limits.priceMicrousdPerToken);

    return this.database.db.transaction(async (tx) => {
      // Serialize budget decisions per contact (advisory locks are cluster-wide
      // and cross-database safe: keyed on a namespaced hash).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ai-budget:${input.contactHash}`}, 0))`);

      // Idempotency: a retried delivery reuses the same request_id (the outbox
      // payload fingerprint) and must not double-reserve.
      const existing = await tx.select().from(aiUsageReservations).where(eq(aiUsageReservations.requestId, input.requestId)).limit(1);
      if (existing.length > 0) {
        const row = existing[0]!;
        if (row.state === "reserved" || row.state === "completed") {
          return { ok: true as const, reserved: true, requestId: input.requestId, estimatedCostMicrousd: row.estimatedCostMicrousd };
        }
        // failed/expired/refunded reservations are terminal: a retry must not
        // silently re-open budget that was already denied or written off.
        return { ok: true as const, reserved: false, requestId: input.requestId, reason: "concurrent_request" as const };
      }

      // One in-flight generation per contact.
      const active = await tx.select({ id: aiUsageReservations.id }).from(aiUsageReservations)
        .where(and(eq(aiUsageReservations.contactHash, input.contactHash), eq(aiUsageReservations.state, "reserved"), sql`${aiUsageReservations.expiresAt} > now()`)).limit(1);
      if (active.length > 0) {
        return { ok: true as const, reserved: false, requestId: input.requestId, reason: "concurrent_request" as const };
      }

      const ensurePeriod = async (subjectHash: string, periodKey: string, scope: string) => {
        const atIso = input.at.toISOString();
        await tx.insert(aiUsagePeriods).values({ id: `period_${randomUUID()}`, subjectHash, periodKey, scope, createdAt: atIso, updatedAt: atIso }).onConflictDoNothing();
        const rows = await tx.select().from(aiUsagePeriods)
          .where(and(eq(aiUsagePeriods.subjectHash, subjectHash), eq(aiUsagePeriods.periodKey, periodKey), eq(aiUsagePeriods.scope, scope)))
          .limit(1).for("update");
        return rows[0]!;
      };

      const conversation = await ensurePeriod(input.contactHash, input.providerThreadId, "conversation");
      if (conversation.requestCount >= limits.maxCallsPerConversation) {
        return { ok: true as const, reserved: false, requestId: input.requestId, reason: "conversation_call_cap" as const };
      }
      const contactDay = await ensurePeriod(input.contactHash, dayKey, "contact_day");
      if (contactDay.requestCount >= limits.maxCallsPerContactDay) {
        return { ok: true as const, reserved: false, requestId: input.requestId, reason: "contact_day_cap" as const };
      }
      const globalDay = await ensurePeriod(GLOBAL_SUBJECT, dayKey, "global_day");
      if (globalDay.reservedTokens + reservedTokens > limits.globalDayTokens) {
        return { ok: true as const, reserved: false, requestId: input.requestId, reason: "global_day_tokens" as const };
      }
      const globalMonth = await ensurePeriod(GLOBAL_SUBJECT, monthKey, "global_month");
      if (globalMonth.costMicrousd + estimatedCost > limits.globalMonthCostMicrousd) {
        return { ok: true as const, reserved: false, requestId: input.requestId, reason: "global_month_cost" as const };
      }

      await tx.insert(aiUsageReservations).values({
        id: `aires_${randomUUID()}`,
        requestId: input.requestId,
        contactHash: input.contactHash,
        providerThreadId: input.providerThreadId,
        dayKey,
        monthKey,
        reservedInputTokens: limits.maxInputTokens,
        reservedOutputTokens: limits.maxOutputTokens,
        model: input.model,
        priceVersion: input.priceVersion,
        estimatedCostMicrousd: estimatedCost,
        state: "reserved",
        expiresAt: new Date(input.at.getTime() + 60_000).toISOString(),
        createdAt: input.at.toISOString(),
        updatedAt: input.at.toISOString(),
      });

      for (const [subjectHash, periodKey, scope] of [
        [input.contactHash, input.providerThreadId, "conversation"],
        [input.contactHash, dayKey, "contact_day"],
        [GLOBAL_SUBJECT, dayKey, "global_day"],
      ] as const) {
        await tx.update(aiUsagePeriods).set({
          requestCount: sql`${aiUsagePeriods.requestCount} + 1`,
          reservedTokens: sql`${aiUsagePeriods.reservedTokens} + ${reservedTokens}`,
          updatedAt: input.at.toISOString(),
        }).where(and(eq(aiUsagePeriods.subjectHash, subjectHash), eq(aiUsagePeriods.periodKey, periodKey), eq(aiUsagePeriods.scope, scope)));
      }

      return { ok: true as const, reserved: true, requestId: input.requestId, estimatedCostMicrousd: estimatedCost };
    });
  }

  /** Reconcile actual usage exactly once (idempotent by terminal state). */
  async complete(input: {
    requestId: string;
    actualInputTokens: number;
    actualOutputTokens: number;
    priceMicrousdPerToken: number;
    at: Date;
  }): Promise<boolean> {
    return this.database.db.transaction(async (tx) => {
      const rows = await tx.select().from(aiUsageReservations).where(eq(aiUsageReservations.requestId, input.requestId)).limit(1);
      const row = rows[0];
      if (!row || row.state !== "reserved") return false;
      const actualTokens = input.actualInputTokens + input.actualOutputTokens;
      const actualCost = Math.round(actualTokens * input.priceMicrousdPerToken);
      await tx.update(aiUsageReservations).set({
        actualInputTokens: input.actualInputTokens,
        actualOutputTokens: input.actualOutputTokens,
        actualCostMicrousd: actualCost,
        state: "completed",
        updatedAt: input.at.toISOString(),
      }).where(eq(aiUsageReservations.requestId, input.requestId));
      await tx.update(aiUsagePeriods).set({
        actualTokens: sql`${aiUsagePeriods.actualTokens} + ${actualTokens}`,
        costMicrousd: sql`${aiUsagePeriods.costMicrousd} + ${actualCost}`,
        updatedAt: input.at.toISOString(),
      }).where(and(eq(aiUsagePeriods.subjectHash, GLOBAL_SUBJECT), eq(aiUsagePeriods.periodKey, row.monthKey), eq(aiUsagePeriods.scope, "global_month")));
      await tx.update(aiUsagePeriods).set({
        actualTokens: sql`${aiUsagePeriods.actualTokens} + ${actualTokens}`,
        updatedAt: input.at.toISOString(),
      }).where(and(eq(aiUsagePeriods.subjectHash, row.contactHash), eq(aiUsagePeriods.periodKey, row.dayKey), eq(aiUsagePeriods.scope, "contact_day")));
      return true;
    });
  }

  /** Terminal failure keeps the conservative reserved accounting (no refund). */
  async fail(requestId: string, reason: string, at: Date): Promise<boolean> {
    const rows = await this.database.db.update(aiUsageReservations).set({ state: "failed", failureReason: reason, updatedAt: at.toISOString() })
      .where(and(eq(aiUsageReservations.requestId, requestId), eq(aiUsageReservations.state, "reserved")))
      .returning({ id: aiUsageReservations.id });
    return rows.length === 1;
  }

  async expireStale(at: Date): Promise<number> {
    const rows = await this.database.db.update(aiUsageReservations).set({ state: "expired", failureReason: "reservation_expired", updatedAt: at.toISOString() })
      .where(and(eq(aiUsageReservations.state, "reserved"), sql`${aiUsageReservations.expiresAt} <= ${at.toISOString()}`))
      .returning({ id: aiUsageReservations.id });
    return rows.length;
  }

  async usageSummary(): Promise<{ todayReservedTokens: number; todayRequests: number; monthCostMicrousd: number; activeReservations: number }> {
    const now = new Date();
    const dayKey = dayKeyFor(now);
    const monthKey = monthKeyFor(now);
    const day = await this.database.db.select().from(aiUsagePeriods)
      .where(and(eq(aiUsagePeriods.subjectHash, GLOBAL_SUBJECT), eq(aiUsagePeriods.periodKey, dayKey), eq(aiUsagePeriods.scope, "global_day"))).limit(1);
    const month = await this.database.db.select().from(aiUsagePeriods)
      .where(and(eq(aiUsagePeriods.subjectHash, GLOBAL_SUBJECT), eq(aiUsagePeriods.periodKey, monthKey), eq(aiUsagePeriods.scope, "global_month"))).limit(1);
    const active = await this.database.db.select({ count: sql<number>`count(*)::int` }).from(aiUsageReservations).where(eq(aiUsageReservations.state, "reserved"));
    return {
      todayReservedTokens: day[0]?.reservedTokens ?? 0,
      todayRequests: day[0]?.requestCount ?? 0,
      monthCostMicrousd: month[0]?.costMicrousd ?? 0,
      activeReservations: active[0]?.count ?? 0,
    };
  }
}
