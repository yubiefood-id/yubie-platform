import type { AssistantIntent, RiskLevel } from "@yubie/domain";
import type { RiskPolicy } from "./ports.js";

export const POLICY_VERSION = "policy-v1";

const GREEN: AssistantIntent[] = [
  "PRODUCT_INFO",
  "PRODUCT_DISCOVERY",
  "USAGE_RECIPE",
  "WHERE_TO_BUY",
  "BUSINESS_HOURS",
  "B2B_INTRO",
];

const AMBER: AssistantIntent[] = [
  "PRICE_OR_PROMO",
  "STOCK_AVAILABILITY",
  "CERTIFICATION",
  "SUITABILITY",
  "B2B_BULK",
  "B2B_SAMPLE",
  "B2B_PRODUCT_DEVELOPMENT",
  "COMPLAINT",
  "OTHER",
];

const RED: AssistantIntent[] = [
  "FOOD_SAFETY",
  "ALLERGEN_OR_HEALTH",
  "REFUND_OR_COMPENSATION",
  "HUMAN_REQUEST",
  "PROMPT_INJECTION",
  "SPAM",
];

export class DeterministicRiskPolicy implements RiskPolicy {
  route(intent: AssistantIntent): RiskLevel {
    if (RED.includes(intent)) return "RED";
    if (GREEN.includes(intent)) return "GREEN";
    if (AMBER.includes(intent)) return "AMBER";
    return "AMBER";
  }
}
