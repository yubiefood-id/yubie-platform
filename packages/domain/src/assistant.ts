export type ConversationState =
  | "BOT_ELIGIBLE"
  | "BOT_ACTIVE"
  | "HANDOFF_REQUESTED"
  | "QUEUED"
  | "HUMAN_ACTIVE"
  | "RESOLVED";

export const BOT_REENTRY_COOLDOWN_MS = 30 * 60 * 1000;

// WA-02 tri-mode: the customer-selected conversation mode, kept separate from
// human-control ownership (conversation_sessions.state + Zammad ticket).
export type CustomerConversationMode = "DETERMINISTIC" | "AI_OPT_IN";

export type SupportPriority = "P0_FOOD_SAFETY" | "P1_EXPLICIT_HUMAN" | "P2_B2B" | "P3_GENERAL";

// Proposed internal triage targets (GOAL_PLAN §3). NOT approved SLA promises:
// never surface these to customers as response-time commitments.
export const PRIORITY_NEXT_ACTION_MS: Record<SupportPriority, number> = {
  P0_FOOD_SAFETY: 15 * 60 * 1000,
  P1_EXPLICIT_HUMAN: 60 * 60 * 1000,
  P2_B2B: 24 * 60 * 60 * 1000,
  P3_GENERAL: 24 * 60 * 60 * 1000,
};

export type AssistantIntent =
  | "PRODUCT_INFO"
  | "PRODUCT_DISCOVERY"
  | "USAGE_RECIPE"
  | "WHERE_TO_BUY"
  | "BUSINESS_HOURS"
  | "B2B_INTRO"
  | "B2B_BULK"
  | "B2B_SAMPLE"
  | "B2B_PRODUCT_DEVELOPMENT"
  | "PRICE_OR_PROMO"
  | "STOCK_AVAILABILITY"
  | "CERTIFICATION"
  | "SUITABILITY"
  | "COMPLAINT"
  | "FOOD_SAFETY"
  | "ALLERGEN_OR_HEALTH"
  | "REFUND_OR_COMPENSATION"
  | "HUMAN_REQUEST"
  | "OTHER"
  | "SPAM"
  | "PROMPT_INJECTION";

export type RiskLevel = "GREEN" | "AMBER" | "RED";

export type AssistantMode = "shadow" | "suggestion" | "auto";

export type AllowedTool =
  | "get_product"
  | "get_root"
  | "get_recipe"
  | "get_purchase_options"
  | "get_business_hours"
  | "get_b2b_service"
  | "request_handoff";

export interface NormalizedMessage {
  conversationId: string;
  messageId: string;
  contactId: string;
  inboxId: string;
  text: string;
  locale: string;
  receivedAt: string;
}

export interface AssistantOutcome {
  kind: "reply" | "handoff" | "noop";
  text?: string;
  handoffReason?: string;
  intent: AssistantIntent;
  risk: RiskLevel;
}
