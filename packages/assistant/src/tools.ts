import { productFamilies, recipes, rootVarieties } from "@yubie/domain";
import type { AllowedTool } from "@yubie/domain";
import type { ToolContext, ToolRegistry, ToolResult } from "./ports.js";

export interface ToolDeps {
  getPurchaseOptions?: (productId: string) => Promise<unknown>;
}

const BUSINESS_HOURS = {
  timezone: "Asia/Jakarta",
  weekdays: "Senin–Jumat 09:00–17:00 WIB",
  note: "Di luar jam operasional, tim akan membalas pada hari kerja berikutnya.",
};

export class InMemoryToolRegistry implements ToolRegistry {
  constructor(private readonly deps: ToolDeps = {}) {}

  async execute(name: AllowedTool, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    switch (name) {
      case "get_product": {
        const productId = String(args.productId ?? "flour");
        const product = productFamilies.find((p) => p.id === productId);
        return { name, data: product ?? null };
      }
      case "get_root": {
        const rootId = String(args.rootId ?? "");
        const root = rootVarieties.find((r) => r.id === rootId || r.slug === rootId);
        return { name, data: root ?? null };
      }
      case "get_recipe": {
        const recipeId = String(args.recipeId ?? "");
        const recipe = recipes.find((r) => r.id === recipeId || r.slug === recipeId);
        return { name, data: recipe ?? null };
      }
      case "get_purchase_options": {
        const productId = String(args.productId ?? "flour");
        if (this.deps.getPurchaseOptions) {
          return { name, data: await this.deps.getPurchaseOptions(productId) };
        }
        return { name, data: { productId, options: [] } };
      }
      case "get_business_hours":
        return { name, data: BUSINESS_HOURS };
      case "get_b2b_service":
        return {
          name,
          data: {
            type: String(args.type ?? "intro"),
            contact: "Tim partnership Yubie akan membantu kebutuhan B2B kamu.",
          },
        };
      case "request_handoff":
        return {
          name,
          data: {
            conversationId: ctx.conversationId,
            reason: String(args.reason ?? "policy"),
          },
        };
      default:
        throw new Error(`tool_not_allowed:${name}`);
    }
  }
}
