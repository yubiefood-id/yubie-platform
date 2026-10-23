import type { PaymentProviderPort } from "@yubie/application";
import { IpaymuPaymentProvider } from "../ipaymu/ipaymu-payment-provider.js";
import { ipaymuOriginForEnv, isIpaymuApiOrigin, type IpaymuEnvironment } from "../ipaymu/signature.js";
import { XenditPaymentProvider } from "../xendit/xendit-payment-provider.js";

/**
 * Builds the configured payment adapter. Preview and disabled return null.
 * iPaymu requires an explicit IPAYMU_ENV (sandbox or production) whose origin
 * matches that environment exactly, and production additionally requires
 * YUBIE_ENV=production. Anything else returns null so a misconfigured process
 * cannot call iPaymu with crossed credentials.
 */
export function createCommercePaymentProvider(env: Record<string, string | undefined>): PaymentProviderPort | null {
  if (env.COMMERCE_PROVIDER === "xendit" && env.XENDIT_SECRET_KEY) {
    return new XenditPaymentProvider({
      secretKey: env.XENDIT_SECRET_KEY,
      ...(env.XENDIT_API_BASE_URL ? { apiBaseUrl: env.XENDIT_API_BASE_URL } : {}),
    });
  }
  if (env.COMMERCE_PROVIDER !== "ipaymu") return null;
  const ipaymuEnv: IpaymuEnvironment | null =
    env.IPAYMU_ENV === "sandbox" ? "sandbox" : env.IPAYMU_ENV === "production" ? "production" : null;
  if (!ipaymuEnv || !env.IPAYMU_VA || !env.IPAYMU_API_KEY || !env.IPAYMU_NOTIFY_URL) return null;
  if (ipaymuEnv === "production" && env.YUBIE_ENV !== "production") return null;
  const apiBaseUrl = env.IPAYMU_API_BASE_URL || ipaymuOriginForEnv(ipaymuEnv);
  if (!isIpaymuApiOrigin(apiBaseUrl, ipaymuEnv)) return null;
  return new IpaymuPaymentProvider({
    va: env.IPAYMU_VA,
    apiKey: env.IPAYMU_API_KEY,
    env: ipaymuEnv,
    apiBaseUrl,
    notifyUrl: env.IPAYMU_NOTIFY_URL,
  });
}
