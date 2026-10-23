export const LAUNCH_PROMO_CODE = "YUBIE15";
export const LAUNCH_PROMO_PERCENT = 15;

export interface PromotionQuote {
  code: string;
  percentage: number;
  discountAmount: number;
}

export interface PromotionCampaign {
  id: string; code: string; status: "draft" | "active" | "paused" | "ended";
  basisPoints: number; eligibleProductIds: string[]; startsAt: string | null; endsAt: string | null;
  approvedAt: string | null; approvedBy: string | null; approvalRef: string | null;
  refundPolicy: "retain_consumed";
}
export interface PromotionEntitlement {
  id: string; campaignId: string; userId: string; phoneIdentityId: string; claimedAt: string;
}
export interface PromotionRedemption {
  id: string; entitlementId: string; campaignId: string; userId: string; orderId: string;
  state: "reserved" | "consumed" | "released"; eligibleSubtotalAmount: number; discountAmount: number;
  basisPoints: number; createdAt: string; updatedAt: string; consumedAt: string | null; releasedAt: string | null;
}
export interface ApprovedPromotionQuote extends PromotionQuote {
  campaignId: string; eligibleSubtotalAmount: number; basisPoints: number;
}
export function isPromotionCampaignActive(campaign: PromotionCampaign, now: string): boolean {
  const at = Date.parse(now), start = Date.parse(campaign.startsAt ?? ""), end = Date.parse(campaign.endsAt ?? ""), approved = Date.parse(campaign.approvedAt ?? "");
  return campaign.status === "active" && Number.isFinite(at) && Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(approved) && approved <= at && start <= at && end > at && !!campaign.approvedBy && !!campaign.approvalRef && Number.isInteger(campaign.basisPoints) && campaign.basisPoints > 0 && campaign.basisPoints < 10000 && campaign.eligibleProductIds.length > 0 && campaign.refundPolicy === "retain_consumed";
}
/** Arithmetic only. Application ownership/history/reservation checks authorize use. */
export function quoteApprovedCampaign(campaign: PromotionCampaign, lines: ReadonlyArray<{ productId: string; unitPrice: number; quantity: number }>, now: string): ApprovedPromotionQuote | null {
  if (!isPromotionCampaignActive(campaign, now)) return null;
  let subtotal = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1) return null;
    if (campaign.eligibleProductIds.includes(line.productId)) subtotal += line.unitPrice * line.quantity;
  }
  if (!Number.isSafeInteger(subtotal) || subtotal <= 0) return null;
  const scaled = subtotal * campaign.basisPoints;
  if (!Number.isSafeInteger(scaled)) return null;
  const discountAmount = Math.floor(scaled / 10000);
  if (!Number.isSafeInteger(discountAmount) || discountAmount <= 0 || discountAmount >= subtotal) return null;
  return { code: campaign.code, percentage: campaign.basisPoints / 100, discountAmount, campaignId: campaign.id, eligibleSubtotalAmount: subtotal, basisPoints: campaign.basisPoints };
}

/**
 * Legacy display signature retained for compatibility. A code string alone
 * is never authority. New pricing uses approved campaign + owned entitlement.
 */
export function quotePromotion(_code: string | null | undefined, _subtotalAmount: number): PromotionQuote | null {
  return null;
}
