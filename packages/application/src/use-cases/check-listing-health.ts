import { err, ok } from "@yubie/domain";
import type {
  Clock,
  LinkHealthChecker,
  ListingHealthRepository,
  MarketplaceListingRepository,
  OperatorTaskRepository,
} from "../ports.js";

export async function checkListingHealth(
  listingKey: string,
  deps: {
    listings: MarketplaceListingRepository;
    health: ListingHealthRepository;
    checker: LinkHealthChecker;
    tasks: OperatorTaskRepository;
    clock: Clock;
    requestId: string;
  },
): Promise<import("@yubie/domain").UseCaseResult<import("@yubie/domain").ListingHealthCheck>> {
  const listingResult = await deps.listings.findByKey(listingKey);
  if (!listingResult.ok) return listingResult;

  const listing = listingResult.value;
  if (!listing) {
    return err({ code: "not_found", message: "Listing not found", retryable: false, requestId: deps.requestId });
  }

  const checkResult = await deps.checker.check(listing.publicUrl);
  if (!checkResult.ok) return checkResult;

  const check = { ...checkResult.value, listingKey, checkedAt: deps.clock.now() };
  const recordResult = await deps.health.record(check);
  if (!recordResult.ok) return recordResult;

  if (["not_found", "blocked", "timeout", "unknown"].includes(check.result)) {
    await deps.tasks.create({
      type: "listing.health",
      status: "open",
      priority: check.result === "not_found" ? 1 : 2,
      listingKey,
      details: `Health check result: ${check.result}`,
      createdAt: deps.clock.now(),
    });
  }

  return ok(check);
}
