import { err, ok } from "@yubie/domain";
import type { CreatePaymentSessionInput, PaymentProviderPort, PaymentSessionHandle } from "@yubie/application";
import type { UseCaseResult } from "@yubie/domain";

/** Minimal structural fetch type: the global fetch (and test stubs) satisfy it. */
export type FetchLike = (input: string, init?: { method?: string | undefined; headers?: Record<string, string> | undefined; body?: string | undefined; signal?: AbortSignal | undefined }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface XenditPaymentProviderOptions {
  /** Server-only secret API key. Never expose through a client bundle. */
  secretKey: string;
  /** Defaults to the public Xendit API; overridable for tests. */
  apiBaseUrl?: string;
  /** Per-request timeout. Default 10s; every provider call is bounded. */
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

interface XenditSessionResponse {
  payment_session_id?: unknown;
  payment_link_url?: unknown;
  status?: unknown;
  expires_at?: unknown;
  business_id?: unknown;
  payment_id?: unknown;
  [key: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Xendit Payment Session adapter behind PaymentProviderPort (official
 * Payments API, docs.xendit.co, verified 2026-10): hosted PAYMENT_LINK flow —
 * POST /sessions {session_type: PAY, mode: PAYMENT_LINK, country: ID,
 * currency: IDR, capture_method: AUTOMATIC}, GET /sessions/{id},
 * POST /sessions/{id}/cancel. Plain fetch, no SDK: React components never see
 * these types. The optional inline `customer` object is deliberately NOT sent
 * until its reference_id reuse semantics are verified against TEST mode.
 *
 * Error contract (see PaymentProviderPort): a 4xx refusal (except 408/429) is
 * DEFINITIVE — err code "validation"; timeouts, network failures and 5xx are
 * AMBIGUOUS — err code "timeout"/"unavailable", retryable. Every request is
 * bounded by AbortSignal.timeout.
 */
export class XenditPaymentProvider implements PaymentProviderPort {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly authorization: string;
  private readonly timeoutMs: number;

  constructor(options: XenditPaymentProviderOptions) {
    this.baseUrl = (options.apiBaseUrl ?? "https://api.xendit.co").replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
    this.authorization = `Basic ${Buffer.from(`${options.secretKey}:`).toString("base64")}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<UseCaseResult<PaymentSessionHandle>> {
    const body: Record<string, unknown> = {
      reference_id: input.referenceId,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      currency: input.currency,
      amount: input.amount,
      country: "ID",
      capture_method: "AUTOMATIC",
      locale: "id",
      description: input.description,
      success_return_url: input.successReturnUrl,
      cancel_return_url: input.cancelReturnUrl,
      items: input.items.map((item) => ({
        reference_id: item.referenceId,
        name: item.name,
        type: "PHYSICAL_PRODUCT",
        category: "food",
        quantity: item.quantity,
        net_unit_amount: item.netUnitAmount,
        currency: input.currency,
      })),
    };
    if (input.expiresAt) body.expires_at = input.expiresAt;

    const response = await this.request("POST", "/sessions", body);
    if (!response.ok) {
      if (response.timedOut) {
        return err({ code: "timeout", message: "Xendit payment session create timed out; outcome unknown.", retryable: true, requestId: "xendit" });
      }
      // 4xx (except 408/429): the provider refused the create — no session
      // exists and nobody can be charged. Everything else is ambiguous.
      const definitive = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
      if (definitive) {
        return err({ code: "validation", message: "Xendit rejected the payment session request.", retryable: false, requestId: "xendit" });
      }
      return err({ code: "unavailable", message: "Xendit payment session outcome unknown (network or server error).", retryable: true, requestId: "xendit" });
    }
    const json = response.json as XenditSessionResponse;
    if (typeof json.payment_session_id !== "string" || typeof json.payment_link_url !== "string") {
      return err({ code: "unavailable", message: "Xendit payment session response missing required fields.", retryable: true, requestId: "xendit" });
    }
    return ok({
      provider: "xendit",
      providerSessionId: json.payment_session_id,
      redirectUrl: json.payment_link_url,
      rawStatus: typeof json.status === "string" ? json.status : "ACTIVE",
      expiresAt: typeof json.expires_at === "string" ? json.expires_at : null,
      ...(typeof json.business_id === "string" ? { providerBusinessId: json.business_id } : {}),
      ...(typeof json.payment_id === "string" ? { providerPaymentId: json.payment_id } : {}),
    });
  }

  async getPaymentSession(providerSessionId: string): Promise<UseCaseResult<PaymentSessionHandle | null>> {
    const response = await this.request("GET", `/sessions/${encodeURIComponent(providerSessionId)}`);
    if (response.status === 404) return ok(null);
    if (!response.ok) {
      return err({ code: response.timedOut ? "timeout" : "unavailable", message: "Xendit payment session lookup failed.", retryable: true, requestId: "xendit" });
    }
    const json = response.json as XenditSessionResponse;
    if (typeof json.payment_session_id !== "string") return ok(null);
    return ok({
      provider: "xendit",
      providerSessionId: json.payment_session_id,
      redirectUrl: typeof json.payment_link_url === "string" ? json.payment_link_url : "",
      rawStatus: typeof json.status === "string" ? json.status : "UNKNOWN",
      expiresAt: typeof json.expires_at === "string" ? json.expires_at : null,
      ...(typeof json.business_id === "string" ? { providerBusinessId: json.business_id } : {}),
      ...(typeof json.payment_id === "string" ? { providerPaymentId: json.payment_id } : {}),
    });
  }

  async cancelPaymentSession(providerSessionId: string): Promise<UseCaseResult<{ accepted: boolean }>> {
    const response = await this.request("POST", `/sessions/${encodeURIComponent(providerSessionId)}/cancel`);
    if (response.status === 404) return ok({ accepted: false });
    if (response.status === 422) return ok({ accepted: false });
    if (!response.ok) {
      return err({ code: response.timedOut ? "timeout" : "unavailable", message: "Xendit payment session cancel failed.", retryable: true, requestId: "xendit" });
    }
    return ok({ accepted: true });
  }

  private async request(method: string, path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: unknown; timedOut: boolean }> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: this.authorization,
          "content-type": "application/json",
        },
        body: method === "GET" || body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const json = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, json, timedOut: false };
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return { ok: false, status: 0, json: {}, timedOut };
    }
  }
}
