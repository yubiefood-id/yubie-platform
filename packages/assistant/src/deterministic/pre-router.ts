import {
  isBackAlias,
  isHumanAlias,
  isMenuAlias,
  matchChoice,
  matchesFoodSafety,
  matchesHealthEscalation,
} from "./aliases.js";
import type { FlowDefinition, PersistedFlowState } from "./types.js";
import { getParentNode } from "./validation.js";

export type PreRouteResult =
  | { kind: "noop_human_active" }
  | { kind: "handoff_food_safety" }
  | { kind: "handoff_health" }
  | { kind: "handoff_human" }
  | { kind: "goto"; nodeId: string }
  | { kind: "choice"; targetNodeId: string }
  | { kind: "collect"; value: string }
  | { kind: "unknown" };

export function preRoute(
  flow: FlowDefinition,
  state: PersistedFlowState,
  text: string,
  conversationState: string,
): PreRouteResult {
  if (conversationState === "HUMAN_ACTIVE" || conversationState === "HANDOFF_REQUESTED") {
    return { kind: "noop_human_active" };
  }

  if (isHumanAlias(text)) return { kind: "handoff_human" };
  if (matchesFoodSafety(text)) return { kind: "handoff_food_safety" };
  if (matchesHealthEscalation(text)) return { kind: "handoff_health" };
  if (isMenuAlias(text)) return { kind: "goto", nodeId: flow.entryNodeId };

  const current = flow.nodes[state.nodeId];
  if (!current) return { kind: "goto", nodeId: flow.entryNodeId };

  if (isBackAlias(text)) {
    const parent = getParentNode(flow, state.nodeId);
    if (parent) return { kind: "goto", nodeId: parent.id };
    return { kind: "goto", nodeId: flow.entryNodeId };
  }

  if (current.action === "collect" && current.contextField) {
    if (isHumanAlias(text)) return { kind: "handoff_human" };
    return { kind: "collect", value: text.trim() };
  }

  if (current.choices?.length) {
    const matched = matchChoice(text, current.choices);
    if (matched) {
      const choice = current.choices.find((c) => c.key === matched);
      if (choice) return { kind: "choice", targetNodeId: choice.targetNodeId };
    }
  }

  return { kind: "unknown" };
}
