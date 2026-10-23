/** Public launch scope is independent of payment-provider configuration. */
export type LaunchProfile = "PUBLIC_CATALOG_NO_SALES" | "MARKETPLACE_MSP" | "DIRECT_COMMERCE_SANDBOX" | "DIRECT_COMMERCE_PRODUCTION";

export function parseLaunchProfile(raw: string | undefined): LaunchProfile {
  if (!raw) return "PUBLIC_CATALOG_NO_SALES";
  if (raw === "PUBLIC_CATALOG_NO_SALES" || raw === "MARKETPLACE_MSP" || raw === "DIRECT_COMMERCE_SANDBOX" || raw === "DIRECT_COMMERCE_PRODUCTION") return raw;
  throw new Error("CONFIG_ERROR: YUBIE_LAUNCH_PROFILE must select an approved launch profile");
}

/** Direct-commerce profiles expose customer routes; live payments remain a separate PSP config gate. */
export function isDirectCommerceProfile(profile: LaunchProfile): boolean {
  return profile === "DIRECT_COMMERCE_SANDBOX" || profile === "DIRECT_COMMERCE_PRODUCTION";
}

/** Provider callbacks and private operations remain available for recovery. */
export function customerRouteEnabled(profile: LaunchProfile, pathname: string): boolean {
  if (isDirectCommerceProfile(profile)) return true;
  if (/^\/v1\/(?:auth|account|checkouts|locations|promotions)(?:\/|$)/.test(pathname)) return false;
  if (/^\/v1\/(?:newsletter|b2b-leads|waitlist)(?:\/|$)/.test(pathname)) return false;
  if (profile === "PUBLIC_CATALOG_NO_SALES" && (/^\/go(?:\/|$)/.test(pathname) || /^\/v1\/products\/[^/]+\/purchase-options$/.test(pathname))) return false;
  return true;
}
