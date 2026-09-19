import { err, isMarketplace, ok, type AttributionContext, type MarketplaceListing } from "@yubie/domain";
import type {
  AttributionPolicy,
  Clock,
  IdGenerator,
  MarketplaceListingRepository,
  OutboundIntentRepository,
  RedirectAllowlistPolicy,
} from "../ports.js";

const ANALYTICS_TIMEOUT_MS = 200;

export async function resolveMarketplaceRedirect(
  channel: string,
  listingKey: string,
  attributionInput: Partial<AttributionContext>,
  deps: {
    listings: MarketplaceListingRepository;
    outbound: OutboundIntentRepository;
    allowlist: RedirectAllowlistPolicy;
    attribution: AttributionPolicy;
    clock: Clock;
    ids: IdGenerator;
    requestId: string;
  },
): Promise<import("@yubie/domain").UseCaseResult<{ destinationUrl: string }>> {
  const { requestId } = deps;

  if (!isMarketplace(channel)) {
    return err({ code: "validation", message: "Invalid marketplace channel", retryable: false, requestId });
  }

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(listingKey)) {
    return err({ code: "validation", message: "Invalid listing key", retryable: false, requestId });
  }

  const listingResult = await deps.listings.findByKey(listingKey);
  if (!listingResult.ok) return listingResult;

  const listing = listingResult.value;
  if (!listing || listing.marketplace !== channel) {
    return err({ code: "not_found", message: "Listing not found", retryable: false, requestId });
  }

  const validationError = validateListingForRedirect(listing, deps.allowlist, requestId);
  if (validationError) return validationError;

  const attributionResult = deps.attribution.sanitize(attributionInput);
  if (!attributionResult.ok) return attributionResult;

  const intent = {
    id: deps.ids.nextId(),
    listingId: listing.id,
    productId: listing.productId,
    ...(listing.skuId ? { skuId: listing.skuId } : {}),
    destinationKind: "marketplace" as const,
    channel: listing.marketplace,
    listingKey: listing.listingKey,
    attribution: attributionResult.value,
    requestId,
    createdAt: deps.clock.now(),
  };

  await appendWithTimeout(deps.outbound, intent);

  return ok({ destinationUrl: listing.publicUrl });
}

function validateListingForRedirect(
  listing: MarketplaceListing,
  allowlist: RedirectAllowlistPolicy,
  requestId: string,
): import("@yubie/domain").ResultError | null {
  if (listing.status !== "active") {
    return err({ code: "not_found", message: "Listing not active", retryable: false, requestId });
  }
  try {
    const parsed = new URL(listing.publicUrl);
    if (parsed.protocol !== "https:") {
      return err({ code: "validation", message: "Listing URL must be HTTPS", retryable: false, requestId });
    }
  } catch {
    return err({ code: "validation", message: "Invalid listing URL", retryable: false, requestId });
  }
  if (!allowlist.isAllowedUrl(listing.publicUrl, listing.marketplace)) {
    return err({ code: "forbidden", message: "Destination host not allowlisted", retryable: false, requestId });
  }
  return null;
}

async function appendWithTimeout(
  outbound: OutboundIntentRepository,
  intent: Parameters<OutboundIntentRepository["append"]>[0],
): Promise<void> {
  try {
    await Promise.race([
      outbound.append(intent),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ANALYTICS_TIMEOUT_MS)),
    ]);
  } catch {
    // Analytics failure must not block redirect after safe listing resolution.
  }
}
