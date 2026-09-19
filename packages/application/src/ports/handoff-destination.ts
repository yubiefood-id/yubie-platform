/** Logical handoff destinations — provider-specific group IDs live in config/provisioning. */
export type HandoffDestination = "CUSTOMER_SUPPORT" | "SALES_PARTNERSHIP" | "FOOD_SAFETY";

export interface HandoffDestinationConfig {
  customerSupportGroupId: string;
  salesPartnershipGroupId: string;
  foodSafetyGroupId: string;
  highPriorityId?: string;
}
