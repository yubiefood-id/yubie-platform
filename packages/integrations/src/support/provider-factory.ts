import type { SupportConversationProvider } from "@yubie/application";
import { parseRuntimeConfig, type RuntimeEnvSource, type SupportProviderName } from "@yubie/config";
import { FakeChatwootClient, HttpChatwootClient } from "../chatwoot/client.js";
import { FakeZammadClient, HttpZammadClient } from "../zammad/client.js";
import { ZammadSupportProvider } from "../zammad/support-provider.js";
import { ChatwootSupportProvider } from "./chatwoot-support-provider.js";
import { FakeSupportProvider } from "./fake-support-provider.js";

export type { SupportProviderName } from "@yubie/config";

/**
 * Resolve the configured support provider name. Unknown values throw
 * RuntimeConfigError instead of falling back to "fake" — a typo such as
 * SUPPORT_PROVIDER=zamamd must stop the deployment, not silently select a
 * fake backend.
 */
export function resolveSupportProviderName(env: RuntimeEnvSource = process.env): SupportProviderName {
  return parseRuntimeConfig(env).supportProvider;
}

/**
 * Build the support provider from validated runtime configuration.
 *
 * Fail-closed contract:
 * - SUPPORT_PROVIDER=zammad always requires explicit Zammad configuration
 *   (ZAMMAD_BASE_URL, ZAMMAD_API_TOKEN; full routing values in
 *   staging/production). A real Zammad provider is never silently replaced
 *   with FakeZammadClient.
 * - Fake providers are allowed only in development/test. Staging/production
 *   requests for SUPPORT_PROVIDER=fake fail in parseRuntimeConfig.
 * - Chatwoot remains available as the ADR-009 rollback path; in
 *   staging/production it requires an explicit API token and base URL.
 */
export function createSupportProvider(env: RuntimeEnvSource = process.env): SupportConversationProvider {
  const config = parseRuntimeConfig(env);

  if (config.supportProvider === "zammad") {
    if (!config.zammad) {
      throw new Error("CONFIG_ERROR: zammad provider selected without validated zammad configuration");
    }
    return new ZammadSupportProvider(
      new HttpZammadClient(config.zammad.baseUrl, config.zammad.apiToken),
      config.zammad.whatsappArticleType,
    );
  }

  if (config.supportProvider === "chatwoot") {
    const token = env.CHATWOOT_API_TOKEN ?? "";
    if (!token) {
      // Reached only in development/test: staging/production deployments
      // without CHATWOOT_API_TOKEN are rejected by parseRuntimeConfig.
      return new ChatwootSupportProvider(new FakeChatwootClient());
    }
    return new ChatwootSupportProvider(
      new HttpChatwootClient(
        env.CHATWOOT_BASE_URL ?? "http://localhost:3000",
        token,
        env.CHATWOOT_ACCOUNT_ID ?? "1",
      ),
    );
  }

  return new FakeSupportProvider();
}

export function createZammadClient(env: RuntimeEnvSource = process.env) {
  const config = parseRuntimeConfig(env);
  if (config.supportProvider === "zammad" && config.zammad) {
    return new HttpZammadClient(config.zammad.baseUrl, config.zammad.apiToken);
  }
  // The support provider is not Zammad, so this client is only a test double
  // for non-Zammad setups — never a silent substitution for a requested real
  // Zammad backend.
  return new FakeZammadClient();
}

export function createChatwootClient(env: RuntimeEnvSource = process.env) {
  const config = parseRuntimeConfig(env);
  const token = env.CHATWOOT_API_TOKEN ?? "";
  if (config.supportProvider === "chatwoot" && token) {
    return new HttpChatwootClient(
      env.CHATWOOT_BASE_URL ?? "http://localhost:3000",
      token,
      env.CHATWOOT_ACCOUNT_ID ?? "1",
    );
  }
  return new FakeChatwootClient();
}
