import type { AllowedTool } from "@yubie/domain";
import type { ToolContext, ToolRegistry, ToolResult } from "./ports.js";

export interface KnowledgeLookup {
  getEffectivePublicKnowledge(type: string, scopeId: string | null): Promise<{
    data: unknown;
    source: string;
    version: number;
    effectiveAt: string;
  } | null>;
}

export interface KnowledgeToolDeps {
  knowledge: KnowledgeLookup;
  getPurchaseOptions?: (productId: string) => Promise<unknown>;
}

export class KnowledgeToolRegistry implements ToolRegistry {
  constructor(private readonly deps: KnowledgeToolDeps) {}

  async execute(name: AllowedTool, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const wrap = (data: unknown, source: string, version: number, effectiveAt: string) => ({
      name,
      data: { data, source, version, effectiveAt },
    });

    switch (name) {
      case "get_product": {
        const productId = String(args.productId ?? "flour");
        const knowledge = await this.deps.knowledge.getEffectivePublicKnowledge("product", productId);
        if (knowledge) return wrap(knowledge.data, knowledge.source, knowledge.version, knowledge.effectiveAt);
        return { name, data: null };
      }
      case "get_root": {
        const rootId = String(args.rootId ?? "");
        const knowledge = await this.deps.knowledge.getEffectivePublicKnowledge("root", rootId);
        if (knowledge) return wrap(knowledge.data, knowledge.source, knowledge.version, knowledge.effectiveAt);
        return { name, data: null };
      }
      case "get_recipe": {
        const recipeId = String(args.recipeId ?? "");
        const knowledge = await this.deps.knowledge.getEffectivePublicKnowledge("recipe", recipeId);
        if (knowledge) return wrap(knowledge.data, knowledge.source, knowledge.version, knowledge.effectiveAt);
        return { name, data: null };
      }
      case "get_purchase_options": {
        const productId = String(args.productId ?? "flour");
        if (this.deps.getPurchaseOptions) {
          const options = await this.deps.getPurchaseOptions(productId);
          return { name, data: options };
        }
        return { name, data: { productId, options: [] } };
      }
      case "get_business_hours": {
        const knowledge = await this.deps.knowledge.getEffectivePublicKnowledge("business_hours", null);
        if (knowledge) return wrap(knowledge.data, knowledge.source, knowledge.version, knowledge.effectiveAt);
        return {
          name,
          data: {
            data: {
              timezone: "Asia/Jakarta",
              weekdays: "Senin–Jumat 09:00–17:00 WIB",
              note: "Di luar jam operasional, tim akan membalas pada hari kerja berikutnya.",
            },
            source: "fallback",
            version: 0,
            effectiveAt: new Date().toISOString(),
          },
        };
      }
      case "get_b2b_service": {
        const knowledge = await this.deps.knowledge.getEffectivePublicKnowledge("b2b_service", String(args.type ?? "intro"));
        if (knowledge) return wrap(knowledge.data, knowledge.source, knowledge.version, knowledge.effectiveAt);
        return {
          name,
          data: {
            data: { type: String(args.type ?? "intro"), contact: "Tim partnership Yubie akan membantu kebutuhan B2B kamu." },
            source: "fallback",
            version: 0,
            effectiveAt: new Date().toISOString(),
          },
        };
      }
      case "request_handoff":
        return {
          name,
          data: { conversationId: ctx.conversationId, reason: String(args.reason ?? "policy") },
        };
      default:
        throw new Error(`tool_not_allowed:${name}`);
    }
  }
}
