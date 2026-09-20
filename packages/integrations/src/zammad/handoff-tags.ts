import type { AssistantIntent } from "@yubie/domain";
import type { HandoffDestination } from "@yubie/application";

const FLOW_VERSION_TAG = "bot:deterministic-v1";
const CHANNEL_TAG = "channel:whatsapp";

const INTENT_TAGS: Partial<Record<AssistantIntent, string>> = {
  WHERE_TO_BUY: "intent:buy",
  PRODUCT_INFO: "intent:product-info",
  PRODUCT_DISCOVERY: "intent:product-info",
  USAGE_RECIPE: "intent:product-info",
  OTHER: "intent:order-help",
  COMPLAINT: "intent:complaint",
  HUMAN_REQUEST: "handoff:human-request",
  FOOD_SAFETY: "handoff:food-safety",
  B2B_INTRO: "intent:b2b",
  B2B_SAMPLE: "intent:b2b",
  B2B_BULK: "intent:b2b",
  B2B_PRODUCT_DEVELOPMENT: "intent:b2b",
};

export interface HandoffTagInput {
  intent: AssistantIntent;
  destination: HandoffDestination;
  handoffReason?: string;
  nodeId?: string;
}

export function buildDeterministicHandoffLabels(input: HandoffTagInput): string[] {
  const labels = new Set<string>(["human-required", FLOW_VERSION_TAG, CHANNEL_TAG]);

  const intentTag = INTENT_TAGS[input.intent];
  if (intentTag) labels.add(intentTag);

  if (input.destination === "FOOD_SAFETY") labels.add("handoff:food-safety");
  if (input.destination === "SALES_PARTNERSHIP") labels.add("b2b");
  if (input.intent === "HUMAN_REQUEST" || input.handoffReason === "human_request") {
    labels.add("handoff:human-request");
  }

  if (input.nodeId?.startsWith("buy.") || input.intent === "WHERE_TO_BUY") {
    labels.add("product:flour");
  }

  return [...labels];
}
