import type { AssistantIntent } from "@yubie/domain";
import type { HandoffCommand, HandoffDestination, SupportThreadRef } from "@yubie/application";
import { resolveZammadRouting, type RuntimeEnvSource } from "@yubie/config";
import { buildDeterministicHandoffLabels } from "./handoff-tags.js";

export interface ZammadHandoffConfig {
  groupIds: {
    customerSupport: string;
    salesPartnership: string;
    foodSafety: string;
    botQueue: string;
  };
  priorityIds: {
    high?: string;
  };
  stateIds: {
    open?: string;
  };
}

function resolveDestination(
  intent: AssistantIntent,
  handoffReason?: string,
  destination?: HandoffDestination,
): HandoffDestination {
  if (destination) return destination;
  if (intent === "FOOD_SAFETY" || handoffReason?.includes("food")) return "FOOD_SAFETY";
  if (intent.startsWith("B2B")) return "SALES_PARTNERSHIP";
  return "CUSTOMER_SUPPORT";
}

export function buildHandoffCommand(
  ref: SupportThreadRef,
  intent: AssistantIntent,
  handoffReason?: string,
  config?: Partial<ZammadHandoffConfig> & { destination?: HandoffDestination; nodeId?: string },
  env: RuntimeEnvSource = process.env,
): HandoffCommand {
  // Routing IDs come from validated configuration: explicit call-site values,
  // then environment, then — only when the runtime is not
  // staging/production-zammad — the documented development fixture IDs.
  // Staging/production deployments are gated by parseRuntimeConfig at startup;
  // resolveZammadRouting keeps the guarantee at the point of use.
  const routing = resolveZammadRouting(env);
  const cfg: ZammadHandoffConfig = {
    groupIds: {
      customerSupport: config?.groupIds?.customerSupport ?? routing.groupIds.customerSupport,
      salesPartnership: config?.groupIds?.salesPartnership ?? routing.groupIds.salesPartnership,
      foodSafety: config?.groupIds?.foodSafety ?? routing.groupIds.foodSafety,
      botQueue: config?.groupIds?.botQueue ?? routing.groupIds.botQueue,
    },
    priorityIds: {
      ...(routing.priorityHigh ? { high: routing.priorityHigh } : {}),
      ...(config?.priorityIds ?? {}),
    },
    stateIds: config?.stateIds ?? {},
  };

  const dest = resolveDestination(intent, handoffReason, config?.destination);
  const tagInput: import("./handoff-tags.js").HandoffTagInput = { intent, destination: dest };
  if (handoffReason) tagInput.handoffReason = handoffReason;
  if (config?.nodeId) tagInput.nodeId = config.nodeId;
  const labels = buildDeterministicHandoffLabels(tagInput);

  if (dest === "SALES_PARTNERSHIP") {
    return {
      threadRef: ref,
      labels,
      groupId: cfg.groupIds.salesPartnership,
      botModeOff: true,
    };
  }

  if (dest === "FOOD_SAFETY") {
    return {
      threadRef: ref,
      labels,
      groupId: cfg.groupIds.foodSafety,
      ...(cfg.priorityIds.high ? { priorityId: cfg.priorityIds.high } : {}),
      botModeOff: true,
    };
  }

  return {
    threadRef: ref,
    labels,
    groupId: cfg.groupIds.customerSupport,
    botModeOff: intent === "HUMAN_REQUEST" || Boolean(handoffReason),
  };
}
