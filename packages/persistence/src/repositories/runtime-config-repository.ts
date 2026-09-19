import { eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { assistantRuntimeConfig, assistantRuntimeConfigAudit } from "../schema/index.js";

export interface RuntimeConfigSnapshot {
  assistantEnabled: boolean;
  mode: "off" | "shadow" | "suggestion" | "auto";
  allowedGreenIntents: string[];
  modelVersion: string;
  promptVersion: string;
  knowledgeVersion: string;
}

const DEFAULT_CONFIG: RuntimeConfigSnapshot = {
  assistantEnabled: true,
  mode: "shadow",
  allowedGreenIntents: ["PRODUCT_INFO", "PRODUCT_DISCOVERY", "USAGE_RECIPE", "WHERE_TO_BUY", "BUSINESS_HOURS", "B2B_INTRO"],
  modelVersion: "default",
  promptVersion: "v1",
  knowledgeVersion: "seed-v1",
};

let auditCounter = 0;

export class PostgresRuntimeConfigRepository {
  constructor(private readonly database: Database) {}

  async getSnapshot(): Promise<RuntimeConfigSnapshot> {
    const rows = await this.database.db.select().from(assistantRuntimeConfig);
    const map = new Map(rows.map((r) => [r.key, r.valueJson]));
    const parse = <T>(key: string, fallback: T): T => {
      const raw = map.get(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    };
    return {
      assistantEnabled: parse("assistant_enabled", DEFAULT_CONFIG.assistantEnabled),
      mode: parse("mode", DEFAULT_CONFIG.mode),
      allowedGreenIntents: parse("allowed_green_intents", DEFAULT_CONFIG.allowedGreenIntents),
      modelVersion: parse("model_version", DEFAULT_CONFIG.modelVersion),
      promptVersion: parse("prompt_version", DEFAULT_CONFIG.promptVersion),
      knowledgeVersion: parse("knowledge_version", DEFAULT_CONFIG.knowledgeVersion),
    };
  }

  async set(key: string, value: unknown, changedBy: string, changedAt: string) {
    const valueJson = JSON.stringify(value);
    const existing = await this.database.db
      .select()
      .from(assistantRuntimeConfig)
      .where(eq(assistantRuntimeConfig.key, key))
      .limit(1);

    auditCounter += 1;
    await this.database.db.insert(assistantRuntimeConfigAudit).values({
      id: `cfg-audit-${auditCounter}`,
      key,
      oldValueJson: existing[0]?.valueJson ?? null,
      newValueJson: valueJson,
      changedBy,
      changedAt,
    });

    if (existing.length > 0) {
      await this.database.db
        .update(assistantRuntimeConfig)
        .set({ valueJson, updatedAt: changedAt, updatedBy: changedBy })
        .where(eq(assistantRuntimeConfig.key, key));
    } else {
      await this.database.db.insert(assistantRuntimeConfig).values({
        key,
        valueJson,
        updatedAt: changedAt,
        updatedBy: changedBy,
      });
    }
    return ok(undefined);
  }
}
