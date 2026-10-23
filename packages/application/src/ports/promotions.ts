import type { PromotionCampaign, PromotionEntitlement, PromotionRedemption } from "@yubie/domain";
/** Transaction-scoped. Customer lock serializes entitlement/checkout decisions. */
export interface PromotionRepository {
  lockCustomer(userId: string): Promise<void>;
  findWelcomeCampaign(): Promise<PromotionCampaign | null>;
  findCampaignByCode(code: string): Promise<PromotionCampaign | null>;
  findEntitlement(userId: string, campaignId: string): Promise<PromotionEntitlement | null>;
  saveEntitlement(value: PromotionEntitlement): Promise<void>;
  findCurrentRedemption(entitlementId: string): Promise<PromotionRedemption | null>;
  hasReservedForUser(userId: string): Promise<boolean>;
  hasPaidOrPendingHistory(userId: string, guestPrincipal?: string): Promise<boolean>;
  reserve(value: PromotionRedemption): Promise<void>;
  settleForOrder(orderId: string, state: "consumed" | "released", now: string): Promise<string[]>;
}
