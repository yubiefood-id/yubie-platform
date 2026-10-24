import { isDirectCommerceProfile, parseLaunchProfile } from "../../packages/config/src/launch.js";

export type TestTier = "mock" | "catalog" | "staging" | "sandbox" | "production-smoke";

const productionHosts = new Set(["yubiefood.com", "www.yubiefood.com"]);
// Retired origins are still forbidden mutation targets, never approved releases.
const forbiddenMutationHosts = new Set([...productionHosts, "yubie.id", "www.yubie.id", "yubiefood.id", "www.yubiefood.id"]);
const sharedHosts = new Set(["staging.yubiefood.com", "api-staging.yubiefood.com"]);

function reject(message: string): never { throw new Error(`E2E_CONFIG: ${message}`); }

function origin(value: string, label: string): string {
  let url: URL;
  try { url = new URL(value); } catch { return reject(`${label} must be an explicit HTTPS origin`); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") reject(`${label} must be an HTTPS origin without credentials, paths or query parameters`);
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) reject(`${label} cannot fall back to localhost`);
  return url.origin;
}

export function testEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const tier = env.YUBIE_E2E_TIER || "mock";
  if (!["mock", "catalog", "staging", "sandbox", "production-smoke"].includes(tier)) reject("unknown tier; select mock, catalog, staging, sandbox or production-smoke");
  let launchProfile;
  try { launchProfile = parseLaunchProfile(env.E2E_LAUNCH_PROFILE || (["mock", "sandbox"].includes(tier) ? "DIRECT_COMMERCE_SANDBOX" : undefined)); }
  catch { return reject("unknown launch profile"); }
  // Any direct-commerce profile (sandbox or production) runs the dynamic
  // storefront — only the catalog profiles are static artifacts with digests.
  const catalog = !isDirectCommerceProfile(launchProfile);
  const expectedDigest = env.EXPECTED_CATALOG_DIGEST || null;
  if (tier === "sandbox" && catalog) reject("provider sandbox cannot select a catalog profile");
  if (tier === "catalog" && !catalog) reject("catalog acceptance cannot select direct commerce");
  if (tier === "mock" || tier === "catalog") return { tier: tier as TestTier, baseURL: "http://127.0.0.1:4173", apiURL: null, expectedSha: null, expectedDigest, launchProfile, catalog, remote: false };
  const baseURL = origin(env.BASE_URL || (tier === "staging" ? "https://staging.yubiefood.com" : tier === "production-smoke" ? "https://yubiefood.com" : ""), "BASE_URL");
  if (tier === "production-smoke") {
    if (!productionHosts.has(new URL(baseURL).hostname)) reject("production smoke must target an approved production domain");
    return { tier: tier as TestTier, baseURL, apiURL: null, expectedSha: env.EXPECTED_RELEASE_SHA || null, expectedDigest, launchProfile, catalog, remote: true };
  }
  const apiURL = catalog ? null : origin(env.API_BASE_URL || (tier === "staging" ? "https://api-staging.yubiefood.com" : ""), "API_BASE_URL");
  if ([baseURL, apiURL].some((value) => value && forbiddenMutationHosts.has(new URL(value).hostname))) reject("mutating tiers cannot target production");
  if (!/^[a-f0-9]{40}$/.test(env.EXPECTED_RELEASE_SHA || "")) reject("EXPECTED_RELEASE_SHA must be the full reviewed SHA");
  if (catalog && !/^sha256:[a-f0-9]{64}$/.test(expectedDigest || "")) reject("catalog staging requires EXPECTED_CATALOG_DIGEST from the reviewed artifact");
  if (tier === "sandbox") {
    if ([baseURL, apiURL].some((value) => value && sharedHosts.has(new URL(value).hostname))) reject("sandbox must be isolated from shared staging");
    if (env.YUBIE_SANDBOX_ACCEPTANCE_APPROVED !== "sandbox" || env.IPAYMU_ENV !== "sandbox" || !env.SANDBOX_PROVIDER_CONTRACT_REF) reject("sandbox requires protected authorization, sandbox mode and a written provider contract reference");
    const start = Date.parse(env.SANDBOX_WINDOW_START || "");
    const end = Date.parse(env.SANDBOX_WINDOW_END || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || Date.now() < start || Date.now() > end || end - start > 4 * 60 * 60 * 1000) reject("sandbox requires a current approved window of at most four hours");
  }
  return { tier: tier as TestTier, baseURL, apiURL, expectedSha: env.EXPECTED_RELEASE_SHA!, expectedDigest, launchProfile, catalog, remote: true };
}
