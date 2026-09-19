import type { KnowledgeLookup } from "../knowledge-tools.js";
import type { DeterministicEngineDeps } from "../deterministic/engine.js";
import { DeterministicConversationEngineAdapter } from "./deterministic-engine.js";
import type { ConversationEngine, ConversationEngineInput, ConversationEngineResult } from "./types.js";

export type BotEngine = "deterministic" | "legacy";

export function resolveBotEngine(): BotEngine {
  const value = (process.env.BOT_ENGINE ?? "deterministic").toLowerCase();
  return value === "legacy" ? "legacy" : "deterministic";
}

export interface ConversationEngineRouterDeps extends DeterministicEngineDeps {
  legacyProcessor?: (input: ConversationEngineInput) => Promise<ConversationEngineResult>;
}

export class ConversationEngineRouter {
  private readonly deterministic: ConversationEngine;

  constructor(private readonly deps: ConversationEngineRouterDeps) {
    this.deterministic = new DeterministicConversationEngineAdapter(deps);
  }

  async process(input: ConversationEngineInput): Promise<ConversationEngineResult> {
    const engine = resolveBotEngine();
    if (engine === "legacy") {
      if (!this.deps.legacyProcessor) {
        throw new Error("legacy_engine_not_configured");
      }
      return this.deps.legacyProcessor(input);
    }
    return this.deterministic.process(input);
  }
}

export function createConversationEngineRouter(deps: {
  knowledge: KnowledgeLookup;
  getPurchaseOptions?: DeterministicEngineDeps["getPurchaseOptions"];
  legacyProcessor?: (input: ConversationEngineInput) => Promise<ConversationEngineResult>;
}): ConversationEngineRouter {
  const routerDeps: ConversationEngineRouterDeps = { knowledge: deps.knowledge };
  if (deps.getPurchaseOptions) routerDeps.getPurchaseOptions = deps.getPurchaseOptions;
  if (deps.legacyProcessor) routerDeps.legacyProcessor = deps.legacyProcessor;
  return new ConversationEngineRouter(routerDeps);
}
