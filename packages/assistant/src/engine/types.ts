import type { NormalizedMessage } from "@yubie/domain";
import type { DeterministicTurnResult, PersistedFlowState } from "../deterministic/types.js";

export type EngineKind = "deterministic" | "legacy";

export interface ConversationEngineResult {
  kind: "reply" | "handoff" | "noop";
  text?: string;
  handoffDestination?: import("../deterministic/types.js").HandoffDestination;
  handoffReason?: string;
  intent: import("@yubie/domain").AssistantIntent;
  risk: import("@yubie/domain").RiskLevel;
  flowVersion?: string;
  nodeId?: string;
  metrics: string[];
  nextFlowState?: PersistedFlowState;
}

export interface ConversationEngineInput {
  message: NormalizedMessage;
  conversationState: string;
  flowState: PersistedFlowState;
}

export interface ConversationEngine {
  readonly kind: EngineKind;
  process(input: ConversationEngineInput): Promise<ConversationEngineResult>;
}

export function mapDeterministicResult(result: DeterministicTurnResult): ConversationEngineResult {
  const action = result.action;
  if (action.kind === "noop") {
    return {
      kind: "noop",
      intent: action.intent,
      risk: action.risk,
      metrics: result.metrics,
      nextFlowState: result.nextState,
      nodeId: action.nodeId,
      flowVersion: result.nextState.flowVersion,
    };
  }
  if (action.kind === "reply") {
    return {
      kind: "reply",
      text: action.text,
      intent: action.intent ?? "OTHER",
      risk: action.risk ?? "GREEN",
      metrics: result.metrics,
      nextFlowState: result.nextState,
      nodeId: action.nodeId,
      flowVersion: result.nextState.flowVersion,
    };
  }
  return {
    kind: "handoff",
    text: action.text,
    handoffDestination: action.destination,
    handoffReason: action.reason,
    intent: action.intent,
    risk: action.risk,
    metrics: result.metrics,
    nextFlowState: result.nextState,
    nodeId: action.nodeId,
    flowVersion: result.nextState.flowVersion,
  };
}
