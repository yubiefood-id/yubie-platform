import type { AssistantIntent, RiskLevel } from "@yubie/domain";

export type HandoffDestination = "CUSTOMER_SUPPORT" | "SALES_PARTNERSHIP" | "FOOD_SAFETY";

export const FLOW_VERSION = "deterministic-v1";

export type NodeActionKind = "menu" | "reply" | "handoff" | "collect";

export interface Choice {
  key: string;
  label: string;
  targetNodeId: string;
  aliases?: string[];
}

export interface FlowNode {
  id: string;
  parentId?: string;
  action: NodeActionKind;
  templateId?: string;
  handoffDestination?: HandoffDestination;
  handoffReason?: string;
  intent?: AssistantIntent;
  risk?: RiskLevel;
  choices?: Choice[];
  contextField?: string;
  nextAfterCollect?: string;
  allowUnreachable?: boolean;
}

export interface FlowDefinition {
  version: string;
  entryNodeId: string;
  nodes: Record<string, FlowNode>;
}

export interface FlowContext {
  [key: string]: unknown;
}

export interface PersistedFlowState {
  nodeId: string;
  flowVersion: string;
  context: FlowContext;
  fallbackCount: number;
}

export type DeterministicAction =
  | { kind: "reply"; text: string; nodeId: string; intent?: AssistantIntent; risk?: RiskLevel }
  | { kind: "handoff"; text: string; destination: HandoffDestination; reason: string; intent: AssistantIntent; risk: RiskLevel; nodeId: string }
  | { kind: "noop"; nodeId: string; intent: AssistantIntent; risk: RiskLevel };

export interface DeterministicTurnInput {
  text: string;
  conversationState: string;
  persisted: PersistedFlowState;
}

export interface DeterministicTurnResult {
  action: DeterministicAction;
  nextState: PersistedFlowState;
  metrics: string[];
}
