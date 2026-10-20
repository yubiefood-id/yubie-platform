import { IpaymuPaymentProvider } from "./ipaymu-payment-provider.js";
import { isSandboxIpaymuHost } from "./signature.js";

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type SandboxProbeDecision =
  | { status: "NOT_RUN"; reason: "flag_off" }
  | { status: "BLOCKED_EXTERNAL"; reason: "missing_secret" | "production_origin" }
  | { status: "READY" };

export interface SandboxProbeReport {
  status: "NOT_RUN" | "BLOCKED_EXTERNAL" | "PASS" | "FAIL";
  reason?: string;
  referenceId?: string;
  redirectHost?: string | null;
}

/**
 * Decides whether a sandbox create is allowed. The default is NOT_RUN.
 * A production origin is refused even when the flag is on.
 */
export function sandboxProbeDecision(env: Record<string, string | undefined>): SandboxProbeDecision {
  if (env.YUBIE_IPAYMU_SANDBOX_E2E !== "1") return { status: "NOT_RUN", reason: "flag_off" };
  const origin = (env.IPAYMU_API_BASE_URL ?? "https://sandbox.ipaymu.com").trim();
  if (!isSandboxIpaymuHost(origin)) return { status: "BLOCKED_EXTERNAL", reason: "production_origin" };
  if (!env.IPAYMU_VA || !env.IPAYMU_API_KEY || !env.IPAYMU_NOTIFY_URL) {
    return { status: "BLOCKED_EXTERNAL", reason: "missing_secret" };
  }
  return { status: "READY" };
}

/**
 * One sandbox create, only after sandboxProbeDecision returns READY.
 * The report contains a reference and a host. It does not contain the VA or API key.
 */
export async function runSandboxProbe(
  env: Record<string, string | undefined>,
  fetchFn: FetchLike,
  referenceId: string,
): Promise<SandboxProbeReport> {
  const decision = sandboxProbeDecision(env);
  if (decision.status !== "READY") return { status: decision.status, reason: decision.reason };
  const provider = new IpaymuPaymentProvider({
    va: env.IPAYMU_VA ?? "",
    apiKey: env.IPAYMU_API_KEY ?? "",
    ...(env.IPAYMU_API_BASE_URL ? { apiBaseUrl: env.IPAYMU_API_BASE_URL } : {}),
    notifyUrl: env.IPAYMU_NOTIFY_URL ?? "",
    fetchFn,
  });
  const created = await provider.createPaymentSession({
    referenceId,
    amount: 10_000,
    currency: "IDR",
    description: "Yubie sandbox probe",
    customerEmail: "sandbox-probe@example.com",
    successReturnUrl: "https://staging.yubiefood.com/checkout/return",
    cancelReturnUrl: "https://staging.yubiefood.com/checkout/cancel",
    items: [{ referenceId, name: `Pesanan Yubie ${referenceId}`, quantity: 1, netUnitAmount: 10_000 }],
  });
  if (!created.ok) return { status: "FAIL", reason: created.error.code, referenceId };
  let redirectHost: string | null = null;
  try {
    redirectHost = new URL(created.value.redirectUrl).host;
  } catch {
    redirectHost = null;
  }
  if (redirectHost !== "sandbox.ipaymu.com") return { status: "FAIL", reason: "redirect_host", referenceId, redirectHost };
  return { status: "PASS", referenceId, redirectHost };
}
