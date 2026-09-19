import type { AssistantIntent } from "@yubie/domain";
import type { HandoffCommand, SupportThreadRef } from "@yubie/application";

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

export function buildHandoffCommand(
  ref: SupportThreadRef,
  intent: AssistantIntent,
  handoffReason?: string,
  config?: Partial<ZammadHandoffConfig>,
): HandoffCommand {
  const labels = ["human-required"];
  const cfg: ZammadHandoffConfig = {
    groupIds: {
      customerSupport: config?.groupIds?.customerSupport ?? "2",
      salesPartnership: config?.groupIds?.salesPartnership ?? "3",
      foodSafety: config?.groupIds?.foodSafety ?? "4",
      botQueue: config?.groupIds?.botQueue ?? "1",
    },
    priorityIds: config?.priorityIds ?? {},
    stateIds: config?.stateIds ?? {},
  };

  if (intent.startsWith("B2B")) {
    labels.push("b2b");
    return {
      threadRef: ref,
      labels,
      groupId: cfg.groupIds.salesPartnership,
      botModeOff: true,
    };
  }

  if (intent === "FOOD_SAFETY" || handoffReason?.includes("food")) {
    labels.push("food-safety");
    return {
      threadRef: ref,
      labels,
      groupId: cfg.groupIds.foodSafety,
      ...(cfg.priorityIds.high ? { priorityId: cfg.priorityIds.high } : {}),
      botModeOff: true,
    };
  }

  if (intent === "HUMAN_REQUEST") {
    return {
      threadRef: ref,
      labels,
      groupId: cfg.groupIds.customerSupport,
      botModeOff: true,
    };
  }

  return {
    threadRef: ref,
    labels,
    groupId: cfg.groupIds.customerSupport,
  };
}
