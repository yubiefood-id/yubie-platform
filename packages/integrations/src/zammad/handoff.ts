import type { AssistantIntent } from "@yubie/domain";
import type { HandoffCommand, HandoffDestination, SupportThreadRef } from "@yubie/application";

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
  config?: Partial<ZammadHandoffConfig> & { destination?: HandoffDestination },
): HandoffCommand {
  const labels = ["human-required"];
  const cfg: ZammadHandoffConfig = {
    groupIds: {
      customerSupport: config?.groupIds?.customerSupport ?? process.env.ZAMMAD_GROUP_CUSTOMER_SUPPORT ?? "2",
      salesPartnership: config?.groupIds?.salesPartnership ?? process.env.ZAMMAD_GROUP_SALES_PARTNERSHIP ?? "3",
      foodSafety: config?.groupIds?.foodSafety ?? process.env.ZAMMAD_GROUP_FOOD_SAFETY ?? "4",
      botQueue: config?.groupIds?.botQueue ?? process.env.ZAMMAD_GROUP_BOT_QUEUE ?? "1",
    },
    priorityIds: config?.priorityIds ?? {},
    stateIds: config?.stateIds ?? {},
  };

  const dest = resolveDestination(intent, handoffReason, config?.destination);

  if (dest === "SALES_PARTNERSHIP") {
    labels.push("b2b");
    return {
      threadRef: ref,
      labels,
      groupId: cfg.groupIds.salesPartnership,
      botModeOff: true,
    };
  }

  if (dest === "FOOD_SAFETY") {
    labels.push("food-safety");
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
