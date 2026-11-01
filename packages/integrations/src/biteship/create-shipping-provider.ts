import type { ShippingProviderPort } from "@yubie/application";
import { BiteshipShippingProvider, BITESHIP_ORIGIN } from "./biteship-shipping-provider.js";

export interface ShippingProviderRuntimeEnv {
  SHIPPING_PROVIDER?: string | undefined;
  BITESHIP_ENV?: string | undefined;
  BITESHIP_API_KEY?: string | undefined;
  BITESHIP_API_BASE_URL?: string | undefined;
}

/**
 * Server-only provider factory. Returns null when shipping is not admitted
 * (unset provider / missing credentials) so callers stay inert; a declared
 * biteship provider with a wrong origin or missing key throws — never
 * half-configure a booking path. The API key never crosses this boundary in
 * logs or errors.
 */
export function createShippingProvider(env: ShippingProviderRuntimeEnv): ShippingProviderPort | null {
  const provider = (env.SHIPPING_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "" || provider === "none") return null;
  if (provider !== "biteship") {
    throw new Error(`Unknown SHIPPING_PROVIDER "${provider}" — supported: none, biteship`);
  }
  const apiKey = env.BITESHIP_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("SHIPPING_PROVIDER=biteship requires BITESHIP_API_KEY (fail closed, never book without credentials)");
  }
  const biteshipEnv = env.BITESHIP_ENV;
  if (biteshipEnv !== "sandbox" && biteshipEnv !== "production") {
    throw new Error("SHIPPING_PROVIDER=biteship requires BITESHIP_ENV=sandbox or production (explicit selection)");
  }
  const base = (env.BITESHIP_API_BASE_URL ?? BITESHIP_ORIGIN).trim().replace(/\/+$/, "");
  if (base !== BITESHIP_ORIGIN) {
    throw new Error(`BITESHIP_API_BASE_URL must be ${BITESHIP_ORIGIN}`);
  }
  return new BiteshipShippingProvider({ apiKey, env: biteshipEnv, apiBaseUrl: base });
}
