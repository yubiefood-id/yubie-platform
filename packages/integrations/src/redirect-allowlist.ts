import type { RedirectAllowlistPolicy } from "@yubie/application";

const MARKETPLACE_HOSTS: Record<string, readonly string[]> = {
  shopee: ["shopee.co.id", "shopee.com"],
  tokopedia: ["tokopedia.com", "www.tokopedia.com"],
};

export class DefaultRedirectAllowlistPolicy implements RedirectAllowlistPolicy {
  isAllowedHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return Object.values(MARKETPLACE_HOSTS).flat().includes(normalized);
  }

  isAllowedUrl(url: string, marketplace: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      const allowed = MARKETPLACE_HOSTS[marketplace] ?? [];
      return allowed.includes(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }
}
