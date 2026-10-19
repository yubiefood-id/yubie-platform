import type { PaymentProviderPort } from "@yubie/application";
import { IpaymuPaymentProvider } from "../ipaymu/ipaymu-payment-provider.js";
import { isSandboxIpaymuHost } from "../ipaymu/signature.js";
import { XenditPaymentProvider } from "../xendit/xendit-payment-provider.js";

/**
 * Builds the configured payment adapter. Preview and disabled return null.
 * iPaymu is constructed only for the sandbox host with sandbox env. A production
 * base URL returns null so a misconfigured process cannot call live iPaymu.
 */
export function createCommercePaymentProvider(env: Record<string, string | undefined>): PaymentProviderPort | null {
  if (env.COMMERCE_PROVIDER === "xendit" && env.XENDIT_SECRET_KEY) {
    return new XenditPaymentProvider({
      secretKey: env.XENDIT_SECRET_KEY,
      ...(env.XENDIT_API_BASE_URL ? { apiBaseUrl: env.XENDIT_API_BASE_URL } : {}),
    });
  }
  if (env.COMMERCE_PROVIDER !== "ipaymu") return null;
  if (env.IPAYMU_ENV !== "sandbox" || !env.IPAYMU_VA || !env.IPAYMU_API_KEY || !env.IPAYMU_NOTIFY_URL) return null;
  const apiBaseUrl = env.IPAYMU_API_BASE_URL || "https://sandbox.ipaymu.com";
  if (!isSandboxIpaymuHost(apiBaseUrl)) return null;
  return new IpaymuPaymentProvider({
    va: env.IPAYMU_VA,
    apiKey: env.IPAYMU_API_KEY,
    apiBaseUrl,
    notifyUrl: env.IPAYMU_NOTIFY_URL,
  });
}
