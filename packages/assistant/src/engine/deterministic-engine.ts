import { FLOW_VERSION } from "../deterministic/types.js";
import { DeterministicConversationEngine, type DeterministicEngineDeps } from "../deterministic/engine.js";
import type { ConversationEngine, ConversationEngineInput, ConversationEngineResult } from "./types.js";
import { mapDeterministicResult } from "./types.js";

export class DeterministicConversationEngineAdapter implements ConversationEngine {
  readonly kind = "deterministic" as const;
  private readonly engine: DeterministicConversationEngine;

  constructor(deps: DeterministicEngineDeps) {
    this.engine = new DeterministicConversationEngine(deps);
  }

  async process(input: ConversationEngineInput): Promise<ConversationEngineResult> {
    const result = await this.engine.processTurn({
      text: input.message.text,
      conversationState: input.conversationState,
      persisted: input.flowState,
    });
    return mapDeterministicResult(result);
  }
}

export function createInitialFlowState(): import("../deterministic/types.js").PersistedFlowState {
  return {
    nodeId: "home",
    flowVersion: FLOW_VERSION,
    context: {},
    fallbackCount: 0,
  };
}
