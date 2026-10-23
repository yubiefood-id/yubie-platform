import { ok, err, type UseCaseResult } from "@yubie/domain";
import type { Clock, TransactionManager, DeliveryLocationProvider, DeliveryLocationSelection, DeliveryLocationSuggestion } from "../ports.js";
export type LocationLookup = { action: "autocomplete"; query: string; sessionToken: string } | { action: "details"; placeId: string; sessionToken: string } | { action: "reverse"; latitude: number; longitude: number };
/** No GPS/address content enters storage. Only pseudonymous expiring budgets do. */
export async function lookupDeliveryLocation(input: LocationLookup & { browser: string; ip: string }, deps: { tx: TransactionManager; clock: Clock; hash(value: string): string; provider: DeliveryLocationProvider }): Promise<UseCaseResult<DeliveryLocationSelection | DeliveryLocationSuggestion[] | null>> {
  const failed = (limited: boolean) => err({ code: limited ? "rate_limited" as const : "unavailable" as const, message: "Location lookup unavailable. Manual entry remains available.", retryable: true, requestId: "delivery-location" });
  try {
    const admitted = await deps.tx.run("location.admission", async repos => {
      const store = repos.customerIdentity; if (!store) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
      const ms = Date.parse(deps.clock.now()), minute = Math.floor(ms / 60_000), day = Math.floor(ms / 86400_000);
      for (const [key, limit, expires] of [
        ["location-browser:" + deps.hash(input.browser) + ":" + minute, 20, (minute + 1) * 60_000],
        ["location-ip:" + deps.hash(input.ip) + ":" + minute, 40, (minute + 1) * 60_000],
        ["location-day:" + day, 500, (day + 1) * 86400_000],
      ] as const) if (!await store.admit(key, limit, new Date(expires).toISOString())) return false;
      return true;
    });
    if (!admitted) return failed(true);
    const result = input.action === "autocomplete" ? await deps.provider.autocomplete(input) : input.action === "details" ? await deps.provider.details(input) : await deps.provider.reverse(input);
    return ok(result);
  } catch { return failed(false); }
}
