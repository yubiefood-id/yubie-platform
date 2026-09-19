import { getProductFamily, ok, err, type ProductPurchaseOptions, type PurchaseOption } from "@yubie/domain";
import type { MarketplaceListingRepository, WhatsAppIntentRepository } from "../ports.js";

export async function getPurchaseOptions(
  slug: string,
  listings: MarketplaceListingRepository,
  whatsapp: WhatsAppIntentRepository,
  requestId: string,
): Promise<import("@yubie/domain").UseCaseResult<ProductPurchaseOptions>> {
  const product = getProductFamily(slug);
  if (!product) {
    return err({ code: "not_found", message: "Product not found", retryable: false, requestId });
  }

  const listingResult = await listings.findActiveByProduct(product.id);
  if (!listingResult.ok) return listingResult;

  const whatsappResult = await whatsapp.findActiveByProduct(product.id);
  if (!whatsappResult.ok) return whatsappResult;

  const marketplaceOptions: PurchaseOption[] = listingResult.value.map((listing) => ({
    kind: "marketplace",
    listingKey: listing.listingKey,
    marketplace: listing.marketplace,
    label: listing.marketplace === "shopee" ? "Shopee" : "Tokopedia",
    redirectPath: `/go/${listing.marketplace}/${listing.listingKey}`,
    productId: listing.productId,
    ...(listing.skuId ? { skuId: listing.skuId } : {}),
  }));

  const whatsappOptions: PurchaseOption[] = whatsappResult.value.map((intent) => ({
    kind: "whatsapp",
    intentKey: intent.intentKey,
    label: intent.audience === "b2b" ? "WhatsApp B2B" : "Tanya via WhatsApp",
    redirectPath: `/go/whatsapp/${intent.intentKey}`,
    ...(intent.productId ? { productId: intent.productId } : {}),
    ...(intent.rootId ? { rootId: intent.rootId } : {}),
  }));

  return ok({
    productSlug: product.slug,
    productId: product.id,
    options: [...marketplaceOptions, ...whatsappOptions],
  });
}
