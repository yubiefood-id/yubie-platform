import { ok, type ListingHealthCheck } from "@yubie/domain";
import type { LinkHealthChecker } from "@yubie/application";

const DEFAULT_TIMEOUT_MS = 5000;

export class HttpLinkHealthChecker implements LinkHealthChecker {
  constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async check(url: string): Promise<import("@yubie/domain").UseCaseResult<ListingHealthCheck>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "YubieListingHealth/1.0" },
      });
      clearTimeout(timeout);
      const result = classifyStatus(response.status);
      return ok({
        listingKey: "",
        checkedAt: new Date().toISOString(),
        result,
        httpStatus: response.status,
        finalUrl: response.headers.get("location") ?? url,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : "unknown";
      const result = message.includes("abort") ? "timeout" : "unknown";
      return ok({
        listingKey: "",
        checkedAt: new Date().toISOString(),
        result,
      });
    }
  }
}

function classifyStatus(status: number): ListingHealthCheck["result"] {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirected_expected";
  if (status === 401 || status === 403) return "auth_required";
  if (status === 404) return "not_found";
  if (status === 429) return "blocked";
  return "unknown";
}
