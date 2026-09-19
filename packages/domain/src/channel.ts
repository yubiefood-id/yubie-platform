export type Marketplace = "shopee" | "tokopedia";

export type ListingStatus = "draft" | "active" | "paused" | "broken" | "retired";

export type PurchaseDestinationKind = "marketplace" | "whatsapp";

export type ListingHealthResult =
  | "ok"
  | "redirected_expected"
  | "auth_required"
  | "not_found"
  | "blocked"
  | "timeout"
  | "unknown";

export type ErrorCode =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "unknown";

export interface AppError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
}

export interface Result<T> {
  ok: true;
  value: T;
}

export interface ResultError {
  ok: false;
  error: AppError;
}

export type UseCaseResult<T> = Result<T> | ResultError;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: AppError): ResultError {
  return { ok: false, error };
}

export interface MarketplaceListing {
  id: string;
  listingKey: string;
  marketplace: Marketplace;
  shopKey: string;
  productId: string;
  skuId?: string;
  externalListingId?: string;
  publicUrl: string;
  status: ListingStatus;
  verifiedAt: string;
  verifiedBy: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppIntent {
  intentKey: string;
  destinationUrl: string;
  productId?: string;
  rootId?: string;
  audience: "b2c" | "b2b";
  status: "active" | "paused" | "retired";
  verifiedAt: string;
  verifiedBy: string;
}

export interface AttributionContext {
  source?: string;
  campaign?: string;
  productId?: string;
  rootId?: string;
  placement?: string;
}

export interface OutboundIntent {
  id: string;
  listingId?: string;
  productId?: string;
  skuId?: string;
  destinationKind: PurchaseDestinationKind;
  channel: Marketplace | "whatsapp";
  listingKey?: string;
  intentKey?: string;
  attribution: AttributionContext;
  requestId: string;
  createdAt: string;
}

export interface MarketplacePurchaseOption {
  kind: "marketplace";
  listingKey: string;
  marketplace: Marketplace;
  label: string;
  redirectPath: string;
  productId: string;
  skuId?: string;
}

export interface WhatsAppPurchaseOption {
  kind: "whatsapp";
  intentKey: string;
  label: string;
  redirectPath: string;
  productId?: string;
  rootId?: string;
}

export type PurchaseOption = MarketplacePurchaseOption | WhatsAppPurchaseOption;

export interface ProductPurchaseOptions {
  productSlug: string;
  productId: string;
  options: PurchaseOption[];
}

export interface ListingHealthCheck {
  listingKey: string;
  checkedAt: string;
  result: ListingHealthResult;
  httpStatus?: number;
  finalUrl?: string;
}

export const MARKETPLACES: readonly Marketplace[] = ["shopee", "tokopedia"];

export function isMarketplace(value: string): value is Marketplace {
  return (MARKETPLACES as readonly string[]).includes(value);
}

export function isActiveListing(listing: MarketplaceListing): boolean {
  return listing.status === "active";
}
