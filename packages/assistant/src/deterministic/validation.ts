import { listTemplateIds } from "./templates.js";
import type { FlowDefinition, FlowNode } from "./types.js";

export function validateFlowDefinition(flow: FlowDefinition): string[] {
  const errors: string[] = [];
  const nodeIds = Object.keys(flow.nodes);

  if (!flow.nodes[flow.entryNodeId]) {
    errors.push(`missing_entry_node:${flow.entryNodeId}`);
  }

  const seen = new Set<string>();
  for (const id of nodeIds) {
    if (seen.has(id)) errors.push(`duplicate_node:${id}`);
    seen.add(id);
  }

  for (const node of Object.values(flow.nodes)) {
    if (node.templateId && !listTemplateIds().includes(node.templateId)) {
      errors.push(`missing_template:${node.id}:${node.templateId}`);
    }

    if (node.parentId && !flow.nodes[node.parentId] && !node.allowUnreachable) {
      errors.push(`invalid_parent:${node.id}:${node.parentId}`);
    }

    for (const choice of node.choices ?? []) {
      if (!flow.nodes[choice.targetNodeId]) {
        errors.push(`invalid_transition:${node.id}:${choice.targetNodeId}`);
      }
    }

    if (node.nextAfterCollect && !flow.nodes[node.nextAfterCollect]) {
      errors.push(`invalid_next_after_collect:${node.id}:${node.nextAfterCollect}`);
    }

    const terminal = node.action === "handoff" || node.action === "reply" || node.action === "menu" || node.action === "collect";
    if (!terminal) errors.push(`invalid_action:${node.id}:${node.action}`);
  }

  const hasHumanRoute = Object.values(flow.nodes).some(
    (n) => n.handoffDestination === "CUSTOMER_SUPPORT" || n.choices?.some((c) => c.targetNodeId.startsWith("handoff.")),
  );
  if (!hasHumanRoute) errors.push("missing_human_route");

  return errors;
}

export function assertValidFlow(flow: FlowDefinition): void {
  const errors = validateFlowDefinition(flow);
  if (errors.length > 0) {
    throw new Error(`invalid_flow_definition:${errors.join(",")}`);
  }
}

export function getParentNode(flow: FlowDefinition, nodeId: string): FlowNode | null {
  const node = flow.nodes[nodeId];
  if (!node?.parentId) return null;
  return flow.nodes[node.parentId] ?? null;
}
