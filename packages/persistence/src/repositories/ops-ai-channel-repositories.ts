import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../client.js";
import { opsAiCalls, whatsappChannelBindings } from "../schema/index.js";

export interface ChannelBindingRecord {
  id: string;
  provider: string;
  phoneE164: string;
  wabaId: string | null;
  zammadChannelId: string | null;
  exclusiveWriter: string;
  status: "registered" | "staged" | "disabled";
  notes: string | null;
  updatedAt: string;
}

/** Declarative channel registration — configuration truth, never activation. */
export class PostgresChannelBindingRepository {
  constructor(private readonly database: Database) {}

  async upsert(input: { provider?: string; phoneE164: string; wabaId?: string; zammadChannelId?: string; status?: ChannelBindingRecord["status"]; notes?: string }) {
    const now = new Date().toISOString();
    const provider = input.provider ?? "meta-cloud-api";
    await this.database.db.insert(whatsappChannelBindings).values({
      id: `wacb_${randomUUID()}`,
      provider,
      phoneE164: input.phoneE164,
      ...(input.wabaId ? { wabaId: input.wabaId } : {}),
      ...(input.zammadChannelId ? { zammadChannelId: input.zammadChannelId } : {}),
      status: input.status ?? "disabled",
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [whatsappChannelBindings.provider, whatsappChannelBindings.phoneE164],
      set: {
        ...(input.wabaId ? { wabaId: input.wabaId } : {}),
        ...(input.zammadChannelId ? { zammadChannelId: input.zammadChannelId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        updatedAt: now,
      },
    });
    return this.get(provider, input.phoneE164);
  }

  async get(provider: string, phoneE164: string) {
    const [row] = await this.database.db.select().from(whatsappChannelBindings)
      .where(and(eq(whatsappChannelBindings.provider, provider), eq(whatsappChannelBindings.phoneE164, phoneE164)))
      .limit(1);
    return row ?? null;
  }

  async list(): Promise<ChannelBindingRecord[]> {
    const rows = await this.database.db.select().from(whatsappChannelBindings).orderBy(whatsappChannelBindings.createdAt);
    return rows.map(row => ({
      id: row.id,
      provider: row.provider,
      phoneE164: row.phoneE164,
      wabaId: row.wabaId,
      zammadChannelId: row.zammadChannelId,
      exclusiveWriter: row.exclusiveWriter,
      status: row.status as ChannelBindingRecord["status"],
      notes: row.notes,
      updatedAt: row.updatedAt,
    }));
  }
}

/** Ops-copilot call history (redacted drafts + accounting refs). */
export class PostgresOpsAICallRepository {
  constructor(private readonly database: Database) {}

  async record(input: { requestId: string; operator: string; action: string; resourceType: string; resourceId: string; model: string; inputTokens: number; outputTokens: number; responseRedacted: string; at: string }) {
    await this.database.db.insert(opsAiCalls).values({
      id: `opsai_${randomUUID()}`,
      requestId: input.requestId,
      operator: input.operator,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      responseRedacted: input.responseRedacted,
      createdAt: input.at,
    });
  }

  async recent(operator: string, limit = 20) {
    const rows = await this.database.db.select().from(opsAiCalls).orderBy(opsAiCalls.createdAt).limit(500);
    return rows.filter(r => r.operator === operator).slice(-limit);
  }
}
