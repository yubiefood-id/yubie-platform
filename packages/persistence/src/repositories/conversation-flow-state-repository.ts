import { and, eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { conversationFlowEvents, conversationFlowState } from "../schema/index.js";

export interface FlowStateRecord {
  id: string;
  provider: string;
  providerThreadId: string;
  flowVersion: string;
  nodeId: string;
  context: Record<string, unknown>;
  fallbackCount: number;
  lastTransitionAt: string;
  createdAt: string;
  updatedAt: string;
}

let flowStateCounter = 0;

export class PostgresConversationFlowStateRepository {
  constructor(private readonly database: Database) {}

  async get(provider: string, providerThreadId: string) {
    const rows = await this.database.db
      .select()
      .from(conversationFlowState)
      .where(
        and(
          eq(conversationFlowState.provider, provider),
          eq(conversationFlowState.providerThreadId, providerThreadId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return ok(null);
    return ok(this.mapRow(row));
  }

  async upsert(state: {
    provider: string;
    providerThreadId: string;
    flowVersion: string;
    nodeId: string;
    context: Record<string, unknown>;
    fallbackCount: number;
    lastTransitionAt: string;
    createdAt: string;
    updatedAt: string;
  }) {
    const existing = await this.get(state.provider, state.providerThreadId);
    if (existing.ok && existing.value) {
      await this.database.db
        .update(conversationFlowState)
        .set({
          flowVersion: state.flowVersion,
          nodeId: state.nodeId,
          contextJsonb: state.context,
          fallbackCount: state.fallbackCount,
          lastTransitionAt: state.lastTransitionAt,
          updatedAt: state.updatedAt,
        })
        .where(eq(conversationFlowState.id, existing.value.id));
      return ok(existing.value.id);
    }

    flowStateCounter += 1;
    const id = `flow-${state.provider}-${state.providerThreadId}-${flowStateCounter}`;
    await this.database.db.insert(conversationFlowState).values({
      id,
      provider: state.provider,
      providerThreadId: state.providerThreadId,
      flowVersion: state.flowVersion,
      nodeId: state.nodeId,
      contextJsonb: state.context,
      fallbackCount: state.fallbackCount,
      lastTransitionAt: state.lastTransitionAt,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    });
    return ok(id);
  }

  async appendEvent(event: {
    provider: string;
    providerThreadId: string;
    flowVersion: string;
    fromNodeId: string | null;
    toNodeId: string;
    eventType: string;
    metricLabels?: Record<string, unknown>;
    createdAt: string;
  }) {
    const id = `flow-ev-${event.provider}-${event.providerThreadId}-${Date.now()}`;
    await this.database.db.insert(conversationFlowEvents).values({
      id,
      provider: event.provider,
      providerThreadId: event.providerThreadId,
      flowVersion: event.flowVersion,
      fromNodeId: event.fromNodeId,
      toNodeId: event.toNodeId,
      eventType: event.eventType,
      metricLabels: event.metricLabels ?? {},
      createdAt: event.createdAt,
    });
    return ok(id);
  }

  private mapRow(row: typeof conversationFlowState.$inferSelect): FlowStateRecord {
    return {
      id: row.id,
      provider: row.provider,
      providerThreadId: row.providerThreadId,
      flowVersion: row.flowVersion,
      nodeId: row.nodeId,
      context: (row.contextJsonb ?? {}) as Record<string, unknown>,
      fallbackCount: row.fallbackCount,
      lastTransitionAt: row.lastTransitionAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
