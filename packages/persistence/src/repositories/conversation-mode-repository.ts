import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { CustomerConversationMode } from "@yubie/domain";
import type { Database } from "../client.js";
import { conversationModeEvents, conversationModeState } from "../schema/index.js";

export const CONVERSATION_MODE_POLICY_VERSION = "trimode-1";

export type ModeTransitionTrigger =
  | "customer_opt_in"
  | "customer_exit"
  | "human_takeover"
  | "operator_reset"
  | "automation_off";

export interface ConversationModeRecord {
  provider: string;
  providerThreadId: string;
  mode: CustomerConversationMode;
  policyVersion: string;
  selectedBy: string;
  selectedAt: string;
}

export class PostgresConversationModeRepository {
  constructor(private readonly database: Database) {}

  async get(provider: string, providerThreadId: string) {
    const rows = await this.database.db
      .select()
      .from(conversationModeState)
      .where(
        and(
          eq(conversationModeState.provider, provider),
          eq(conversationModeState.providerThreadId, providerThreadId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return ok(null);
    return ok({
      provider: row.provider,
      providerThreadId: row.providerThreadId,
      mode: row.mode as CustomerConversationMode,
      policyVersion: row.policyVersion,
      selectedBy: row.selectedBy,
      selectedAt: row.selectedAt,
    } satisfies ConversationModeRecord);
  }

  /**
   * Transition the persisted conversation mode and append an audit event.
   * A transition to the already-active mode is a no-op (no event row), so
   * per-turn callers can invoke this unconditionally without audit spam.
   * Runs inside the caller's conversation-locked transaction.
   */
  async transition(
    provider: string,
    providerThreadId: string,
    toMode: CustomerConversationMode,
    triggerKind: ModeTransitionTrigger,
    at: string,
    options?: { selectedBy?: string; policyVersion?: string; detail?: string },
  ) {
    const existing = await this.get(provider, providerThreadId);
    const fromMode = existing.ok ? existing.value?.mode ?? null : null;
    if (fromMode === toMode) return ok({ changed: false, fromMode });

    const selectedBy = options?.selectedBy ?? (triggerKind === "operator_reset" ? "operator" : "customer");
    const policyVersion = options?.policyVersion ?? CONVERSATION_MODE_POLICY_VERSION;
    const id = `mode_${provider}_${randomUUID()}`;
    await this.database.db
      .insert(conversationModeState)
      .values({
        id,
        provider,
        providerThreadId,
        mode: toMode,
        policyVersion,
        selectedBy,
        selectedAt: at,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: [conversationModeState.provider, conversationModeState.providerThreadId],
        set: { mode: toMode, policyVersion, selectedBy, selectedAt: at, updatedAt: at },
      });
    await this.database.db.insert(conversationModeEvents).values({
      id: `mode_ev_${randomUUID()}`,
      provider,
      providerThreadId,
      fromMode,
      toMode,
      triggerKind,
      detail: options?.detail ?? null,
      createdAt: at,
    });
    return ok({ changed: true, fromMode });
  }

  async modeCounts() {
    const rows = await this.database.db
      .select({ mode: conversationModeState.mode, count: sql<number>`count(*)::int` })
      .from(conversationModeState)
      .groupBy(conversationModeState.mode);
    return ok(rows);
  }
}
