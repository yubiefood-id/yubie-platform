import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { withAssistantTransaction } from "../assistant-work.js";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { assistantRuntimeConfig, assistantRuntimeConfigAudit } from "../schema/index.js";

export interface AIAssistPolicyLimits {
  maxCallsPerConversation: number;
  maxCallsPerContactDay: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  contextTurns: number;
  globalDayTokens: number;
  globalMonthCostMicrousd: number;
  priceMicrousdPerToken: number;
  priceVersion: string;
}

export interface AIAssistPolicy {
  mode: "off" | "live";
  limits: AIAssistPolicyLimits;
  approvalRef?: string;
  changedBy?: string;
}

// Fail-closed defaults: with no approved policy the AI helper can never run,
// regardless of the ai_assist_enabled switch.
export const DEFAULT_AI_ASSIST_POLICY: AIAssistPolicy = {
  mode: "off",
  limits: {
    maxCallsPerConversation: 0,
    maxCallsPerContactDay: 0,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    timeoutMs: 8000,
    contextTurns: 4,
    globalDayTokens: 0,
    globalMonthCostMicrousd: 0,
    priceMicrousdPerToken: 0,
    priceVersion: "unset",
  },
};

function parseAIPolicy(raw: unknown): AIAssistPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_AI_ASSIST_POLICY;
  const value = raw as Partial<AIAssistPolicy> & { limits?: Partial<AIAssistPolicyLimits> };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    mode: value.mode === "live" ? "live" : "off",
    limits: {
      maxCallsPerConversation: num(value.limits?.maxCallsPerConversation),
      maxCallsPerContactDay: num(value.limits?.maxCallsPerContactDay),
      maxInputTokens: num(value.limits?.maxInputTokens),
      maxOutputTokens: num(value.limits?.maxOutputTokens),
      timeoutMs: num(value.limits?.timeoutMs) > 0 ? num(value.limits?.timeoutMs) : DEFAULT_AI_ASSIST_POLICY.limits.timeoutMs,
      contextTurns: num(value.limits?.contextTurns) > 0 ? num(value.limits?.contextTurns) : DEFAULT_AI_ASSIST_POLICY.limits.contextTurns,
      globalDayTokens: num(value.limits?.globalDayTokens),
      globalMonthCostMicrousd: num(value.limits?.globalMonthCostMicrousd),
      priceMicrousdPerToken: num(value.limits?.priceMicrousdPerToken),
      priceVersion: typeof value.limits?.priceVersion === "string" ? value.limits.priceVersion : DEFAULT_AI_ASSIST_POLICY.limits.priceVersion,
    },
    ...(typeof value.approvalRef === "string" && value.approvalRef ? { approvalRef: value.approvalRef } : {}),
    ...(typeof value.changedBy === "string" && value.changedBy ? { changedBy: value.changedBy } : {}),
  };
}

export interface RuntimeConfigSnapshot {
  flowVersion: "deterministic-v1" | "deterministic-v2";
  websiteRelease: unknown;
  supportAcceptance: unknown;
  assistantEnabled: boolean;
  mode: "off" | "shadow" | "suggestion" | "auto";
  allowedGreenIntents: string[];
  modelVersion: string;
  promptVersion: string;
  knowledgeVersion: string;
  // WA-02/03: tri-mode AI helper. Enabled only when the audited switch is on
  // AND an approved live policy with complete limits exists (ADR-015 proposed).
  aiAssistEnabled: boolean;
  aiPolicy: AIAssistPolicy;
  // Operator-only ops copilot (z.ai GLM). Same fail-closed shape; distinct
  // switch and policy so customer and operator AI can never enable together
  // by accident.
  opsAIEnabled: boolean;
  opsAIPolicy: AIAssistPolicy;
  // WA-05: business-initiated outbound template gateway. Fail-closed default.
  outboundWhatsappEnabled: boolean;
  outboundDailyContactCap: number;
}

const DEFAULT_CONFIG: RuntimeConfigSnapshot = {
  flowVersion: "deterministic-v1",
  websiteRelease: null,
  supportAcceptance: null,
  assistantEnabled: true,
  mode: "shadow",
  allowedGreenIntents: ["PRODUCT_INFO", "PRODUCT_DISCOVERY", "USAGE_RECIPE", "WHERE_TO_BUY", "BUSINESS_HOURS", "B2B_INTRO"],
  modelVersion: "default",
  promptVersion: "v1",
  knowledgeVersion: "seed-v1",
  aiAssistEnabled: false,
  aiPolicy: DEFAULT_AI_ASSIST_POLICY,
  opsAIEnabled: false,
  opsAIPolicy: DEFAULT_AI_ASSIST_POLICY,
  outboundWhatsappEnabled: false,
  outboundDailyContactCap: 1,
};


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
    const snapshot: RuntimeConfigSnapshot = {
      flowVersion: parse<string>("deterministic_flow_version", "deterministic-v1") === "deterministic-v2" ? "deterministic-v2" : "deterministic-v1",
      websiteRelease: parse("website_release", null),
      supportAcceptance: parse("support_acceptance", null),
      assistantEnabled: parse("assistant_enabled", DEFAULT_CONFIG.assistantEnabled),
      mode: parse("mode", DEFAULT_CONFIG.mode),
      allowedGreenIntents: parse("allowed_green_intents", DEFAULT_CONFIG.allowedGreenIntents),
      modelVersion: parse("model_version", DEFAULT_CONFIG.modelVersion),
      promptVersion: parse("prompt_version", DEFAULT_CONFIG.promptVersion),
      knowledgeVersion: parse("knowledge_version", DEFAULT_CONFIG.knowledgeVersion),
      aiAssistEnabled: parse("ai_assist_enabled", DEFAULT_CONFIG.aiAssistEnabled) === true,
      aiPolicy: parseAIPolicy(parse<unknown>("ai_policy", null)),
      opsAIEnabled: parse("ops_ai_enabled", DEFAULT_CONFIG.opsAIEnabled) === true,
      opsAIPolicy: parseAIPolicy(parse<unknown>("ops_ai_policy", null)),
      outboundWhatsappEnabled: parse<{ enabled?: boolean }>("outbound_whatsapp", {}).enabled === true,
      outboundDailyContactCap: (() => { const cap = parse<{ dailyContactCap?: unknown }>("outbound_whatsapp", {}).dailyContactCap; return typeof cap === "number" && Number.isInteger(cap) && cap >= 1 && cap <= 10 ? cap : DEFAULT_CONFIG.outboundDailyContactCap; })(),
    };
    // The master switch alone is never sufficient: a live, complete policy is
    // required for the menu path to treat AI as available (fail closed).
    snapshot.aiAssistEnabled = snapshot.aiAssistEnabled && snapshot.aiPolicy.mode === "live";
    snapshot.opsAIEnabled = snapshot.opsAIEnabled && snapshot.opsAIPolicy.mode === "live";
    return snapshot;
  }

  async set(key: string, value: unknown, changedBy: string, changedAt: string) {
    return this.setMany([{key,value}],changedBy,changedAt);
  }

  async setMany(entries: Array<{key:string;value:unknown}>, changedBy: string, changedAt: string) {
    return withAssistantTransaction(this.database,async bound=>{
      const repo=new PostgresRuntimeConfigRepository(bound);
      for(const entry of entries)await repo.setLocked(entry.key,entry.value,changedBy,changedAt);
      return ok(undefined);
    },"yubi:runtime-config");
  }

  private async setLocked(key: string, value: unknown, changedBy: string, changedAt: string) {
    const valueJson = JSON.stringify(value);
    const existing = await this.database.db
      .select()
      .from(assistantRuntimeConfig)
      .where(eq(assistantRuntimeConfig.key, key))
      .limit(1);

    const auditId = `cfg_audit_${randomUUID()}`;
    await this.database.db.insert(assistantRuntimeConfigAudit).values({
      id: auditId,
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
