import { err, ok } from "@yubie/domain";
import type { CreatePaymentSessionInput, PaymentProviderPort, PaymentSessionHandle } from "@yubie/application";
import type { UseCaseResult } from "@yubie/domain";

/** Minimal structural fetch type: the global fetch (and test stubs) satisfy it. */
export type FetchLike = (input: string, init?: { method?: string | undefined; headers?: Record<string, string> | undefined; body?: string | undefined }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface XenditPaymentProviderOptions {
  /** Server-only secret API key. Never expose through a client bundle. */
  secretKey: string;
  /** Defaults to the public Xendit API; overridable for tests. */
  apiBaseUrl?: string;
  fetchFn?: FetchLike;
}

interface XenditSessionResponse {
  payment_session_id?: unknown;
  payment_link_url?: unknown;
  status?: unknown;
  expires_at?: unknown;
  [key: string]: unknown;
}

/**
 * Xendit Payment Session adapter behind PaymentProviderPort. Plain fetch, no
 * SDK: session_type PAY, hosted PAYMENT_LINK flow, country ID, currency IDR,
 * capture_method AUTOMATIC. React components never see these types.
 */
export class XenditPaymentProvider implements PaymentProviderPort {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly authorization: string;

  constructor(options: XenditPaymentProviderOptions) {
    this.baseUrl = (options.apiBaseUrl ?? "https://api.xendit.co").replace(/\/$/, "");
    this.fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
    this.authorization = `Basic ${Buffer.from(`${options.secretKey}:`).toString("base64")}`;
  }

  async createPaymentSession(input: CreatePaymentSessionInput): Promise<UseCaseResult<PaymentSessionHandle>> {
    const body: Record<string, unknown> = {
      reference_id: input.referenceId,
      session_type: "PAY",
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
        quantity: item.quantity,
        net_unit_amount: item.netUnitAmount,
        currency: input.currency,
      })),
    };
    if (input.expiresAt) body.expires_at = input.expiresAt;

    const response = await this.request("POST", "/payment_sessions", body);
    if (!response.ok) {
      return err({ code: "unavailable", message: "Xendit payment session creation failed.", retryable: true, requestId: "xendit" });
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
    });
  }

  async getPaymentSession(providerSessionId: string): Promise<UseCaseResult<PaymentSessionHandle | null>> {
    const response = await this.request("GET", `/payment_sessions/${encodeURIComponent(providerSessionId)}`);
    if (response.status === 404) return ok(null);
    if (!response.ok) {
      return err({ code: "unavailable", message: "Xendit payment session lookup failed.", retryable: true, requestId: "xendit" });
    }
    const json = response.json as XenditSessionResponse;
    if (typeof json.payment_session_id !== "string") return ok(null);
    return ok({
      provider: "xendit",
      providerSessionId: json.payment_session_id,
      redirectUrl: typeof json.payment_link_url === "string" ? json.payment_link_url : "",
      rawStatus: typeof json.status === "string" ? json.status : "UNKNOWN",
      expiresAt: typeof json.expires_at === "string" ? json.expires_at : null,
    });
  }

  async cancelPaymentSession(providerSessionId: string): Promise<UseCaseResult<{ accepted: boolean }>> {
    const response = await this.request("POST", `/payment_sessions/${encodeURIComponent(providerSessionId)}/cancel`, {});
    if (response.status === 404) return ok({ accepted: false });
    if (!response.ok) {
      return err({ code: "unavailable", message: "Xendit payment session cancel failed.", retryable: true, requestId: "xendit" });
    }
    return ok({ accepted: true });
  }

  private async request(method: string, path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: unknown }> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: this.authorization,
          "content-type": "application/json",
          "x-api-version": "2025-01-01",
        },
        body: method === "GET" ? undefined : JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, json };
    } catch {
      return { ok: false, status: 0, json: {} };
    }
  }
}
