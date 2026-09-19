export type ConversationState =
  | "BOT_ELIGIBLE"
  | "BOT_ACTIVE"
  | "HANDOFF_REQUESTED"
  | "QUEUED"
  | "HUMAN_ACTIVE"
  | "RESOLVED";

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
