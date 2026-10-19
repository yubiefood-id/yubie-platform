import { err, ok, type UseCaseResult } from "@yubie/domain";
import type { CreatePaymentSessionInput, PaymentProviderPort, PaymentSessionHandle } from "@yubie/application";
import { IPAYMU_SANDBOX_ORIGIN, isSandboxIpaymuHost, signIpaymuRequest } from "./signature.js";

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface IpaymuPaymentProviderOptions {
  va: string;
  apiKey: string;
  /** Must be the official sandbox origin. Production hosts throw at construction. */
  apiBaseUrl?: string;
  notifyUrl: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * iPaymu Redirect adapter. Create is a single POST with no automatic retry.
 * getPaymentSession checks POST /api/v2/transaction and only accepts a numeric
 * transactionId. SessionID lookup and cancel are not documented; both fail closed.
 */
export class IpaymuPaymentProvider implements PaymentProviderPort {
  private readonly origin: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: IpaymuPaymentProviderOptions) {
    const origin = (options.apiBaseUrl ?? IPAYMU_SANDBOX_ORIGIN).replace(/\/$/, "");
    if (!isSandboxIpaymuHost(origin)) {
      throw new Error("iPaymu adapter refuses a non-sandbox API origin");
    }
    if (!isPublicHttps(options.notifyUrl)) {
      throw new Error("iPaymu notifyUrl must be a public https URL");
    }
    this.origin = origin;
    this.fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<UseCaseResult<PaymentSessionHandle>> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      return err({ code: "validation", message: "iPaymu amount must be a positive integer IDR value.", retryable: false, requestId: "ipaymu" });
    }
    const lineTotal = input.items.reduce((sum, item) => sum + item.netUnitAmount * item.quantity, 0);
    if (lineTotal !== input.amount) {
      return err({ code: "validation", message: "iPaymu line totals must equal the server-quoted amount.", retryable: false, requestId: "ipaymu" });
    }
    const payload = {
      product: input.items.map((item) => item.name),
      qty: input.items.map((item) => String(item.quantity)),
      price: input.items.map((item) => String(item.netUnitAmount)),
      description: input.items.map((item) => item.name),
      returnUrl: input.successReturnUrl,
      notifyUrl: this.options.notifyUrl,
      cancelUrl: input.cancelReturnUrl,
      referenceId: input.referenceId,
      buyerEmail: input.customerEmail,
    };
    const body = JSON.stringify(payload);
    const signature = signIpaymuRequest("POST", this.options.va, body, this.options.apiKey);
    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await this.fetchFn(`${this.origin}/api/v2/payment`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          va: this.options.va,
          signature,
          timestamp: formatTimestamp(this.now()),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return err({
        code: timedOut ? "timeout" : "unavailable",
        message: "iPaymu create outcome is unknown.",
        retryable: true,
        requestId: "ipaymu",
      });
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return err({ code: response.status === 408 ? "timeout" : "unavailable", message: "iPaymu create outcome is unknown.", retryable: true, requestId: "ipaymu" });
    }
    if (!response.ok) {
      return err({ code: "validation", message: "iPaymu refused the payment create.", retryable: false, requestId: "ipaymu" });
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return err({ code: "unavailable", message: "iPaymu create response was not readable.", retryable: true, requestId: "ipaymu" });
    }
    const data = asRecord(asRecord(parsed)?.Data);
    const sessionId = typeof data?.SessionID === "string" ? data.SessionID : "";
    const redirectUrl = typeof data?.Url === "string" ? data.Url : "";
    if (!sessionId || !isSandboxIpaymuHost(redirectUrl)) {
      return err({ code: "unavailable", message: "iPaymu create response did not include an allowlisted session URL.", retryable: true, requestId: "ipaymu" });
    }
    return ok({
      provider: "ipaymu",
      providerSessionId: sessionId,
      redirectUrl,
      rawStatus: "PENDING",
      expiresAt: input.expiresAt ?? null,
    });
  }

  async getPaymentSession(providerSessionId: string): Promise<UseCaseResult<PaymentSessionHandle | null>> {
    if (!/^\d+$/.test(providerSessionId)) {
      return err({
        code: "unsupported",
        message: "iPaymu transaction check requires transactionId. SessionID lookup is not documented.",
        retryable: false,
        requestId: "ipaymu",
      });
    }
    const body = JSON.stringify({ transactionId: providerSessionId });
    const signature = signIpaymuRequest("POST", this.options.va, body, this.options.apiKey);
    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await this.fetchFn(`${this.origin}/api/v2/transaction`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          va: this.options.va,
          signature,
          timestamp: formatTimestamp(this.now()),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return err({ code: "unavailable", message: "iPaymu transaction check failed.", retryable: true, requestId: "ipaymu" });
    }
    if (!response.ok) {
      return err({ code: "unavailable", message: "iPaymu transaction check failed.", retryable: true, requestId: "ipaymu" });
    }
    const parsed = asRecord(await response.json());
    const data = asRecord(parsed?.Data);
    const status = typeof data?.Status === "number" ? data.Status : Number.NaN;
    const sessionId = typeof data?.SessionId === "string" ? data.SessionId : providerSessionId;
    return ok({
      provider: "ipaymu",
      providerSessionId: sessionId,
      redirectUrl: "",
      rawStatus: mapIpaymuStatus(status),
      expiresAt: null,
      providerPaymentId: providerSessionId,
    });
  }

  async cancelPaymentSession(): Promise<UseCaseResult<{ accepted: boolean }>> {
    return ok({ accepted: false });
  }
}

export function mapIpaymuStatus(status: number): string {
  switch (status) {
    case 1:
      return "SUCCEEDED";
    case 2:
      return "CANCELLED";
    case 3:
      return "REFUNDED";
    case 4:
    case 5:
      return "FAILED";
    case -2:
      return "EXPIRED";
    case 6:
      return "UNSETTLED";
    default:
      return "PENDING";
  }
}

function formatTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isPublicHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}
