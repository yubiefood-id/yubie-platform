export const LAUNCH_PROMO_CODE = "YUBIE15";
export const LAUNCH_PROMO_PERCENT = 15;

export interface PromotionQuote {
  code: typeof LAUNCH_PROMO_CODE;
  percentage: typeof LAUNCH_PROMO_PERCENT;
  discountAmount: number;
}

/**
 * Public launch promotion approved for the storefront. The server calls this
 * function again during checkout; browser totals are display-only.
 */
export function quotePromotion(code: string | null | undefined, subtotalAmount: number): PromotionQuote | null {
  if (code?.trim().toUpperCase() !== LAUNCH_PROMO_CODE || !Number.isInteger(subtotalAmount) || subtotalAmount <= 0) {
    return null;
  }
  return {
    code: LAUNCH_PROMO_CODE,
    percentage: LAUNCH_PROMO_PERCENT,
    discountAmount: Math.floor((subtotalAmount * LAUNCH_PROMO_PERCENT) / 100),
  };
}
