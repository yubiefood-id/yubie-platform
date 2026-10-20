/**
 * Pure proxy/attempt-key helpers (no imports, no aliases) so they are
 * unit-testable under plain node and reusable inside the Vinext bundle.
 */

/**
 * The ONLY browser headers the same-origin proxy ever forwards to apps/api.
 * Everything else stays at the edge — forwarding arbitrary client headers
 * would turn the proxy into a header-injection surface.
 */
export function forwardableProxyHeaders(headers: Headers): Record<string, string> {
  const forwarded: Record<string, string> = {};
  const idempotencyKey = headers.get("idempotency-key");
  if (idempotencyKey && idempotencyKey.length > 0 && idempotencyKey.length <= 128) {
    forwarded["idempotency-key"] = idempotencyKey;
  }
  const requestId = headers.get("x-request-id");
  if (requestId && /^[A-Za-z0-9_-]{1,64}$/.test(requestId)) {
    forwarded["x-request-id"] = requestId;
  }
  return forwarded;
}

/**
 * One logical checkout attempt = one idempotency key.
 *
 *  - "ambiguous": the request's outcome is unknown (fetch threw before any
 *    HTTP response). The SAME key must be reused so the server can dedupe a
 *    retry that may already have created the order/session.
 *  - "definitive": an HTTP response arrived (success OR failure). The server
 *    has decided this key's fate (stored outcome, conflict, or new-key
 *    instruction) — the attempt closes and the next submit gets a fresh key.
 *  - "reset": the cart materially changed; the logical attempt is void.
 */
export function nextAttemptKey(previous: string | null, outcome: "ambiguous", freshKey: string): string;
export function nextAttemptKey(previous: string | null, outcome: "definitive" | "reset", freshKey: string): null;
export function nextAttemptKey(previous: string | null, outcome: "ambiguous" | "definitive" | "reset", freshKey: string): string | null;
export function nextAttemptKey(previous: string | null, outcome: "ambiguous" | "definitive" | "reset", freshKey: string): string | null {
  if (outcome === "ambiguous") return previous ?? freshKey;
  return null;
}

/**
 * Gateway, rate-limit and idempotency responses are not proof the provider
 * create finished. 408/409/429/502/503/504 keep the attempt key. Other HTTP
 * statuses close it.
 */
export function attemptOutcomeForHttpStatus(status: number): "ambiguous" | "definitive" {
  if (status === 408 || status === 409 || status === 429 || status === 502 || status === 503 || status === 504) return "ambiguous";
  return "definitive";
}

export interface HeldAttempt {
  key: string;
  fingerprint: string;
}

/**
 * A held key belongs to the cart it was minted for. Reusing it for a changed
 * cart would only produce an idempotency conflict, so a changed cart starts a
 * new attempt; the server still dedupes by principal and cart.
 */
export function attemptKeyForCart(held: HeldAttempt | null, fingerprint: string, freshKey: string): HeldAttempt {
  if (held && held.fingerprint === fingerprint) return held;
  return { key: freshKey, fingerprint };
}

export type CheckoutUiOutcome = "redirect" | "preview" | "pending" | "sold_out" | "invalid" | "failed";

const PENDING_CODES = new Set(["PENDING_RECONCILIATION", "PROVIDER_UNAVAILABLE", "API_TIMEOUT", "IDEMPOTENCY_KEY_REUSED"]);

export function classifyCheckoutResponse(status: number, payload: { code?: unknown; data?: { mode?: unknown; redirectUrl?: unknown; status?: unknown } } | null): CheckoutUiOutcome {
  const data = payload?.data;
  if (status === 201 && data?.mode === "live" && typeof data.redirectUrl === "string") return "redirect";
  if (status >= 200 && status < 300 && data?.status === "preview") return "preview";
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (code === "INSUFFICIENT_INVENTORY" || code === "UNAVAILABLE_LINE") return "sold_out";
  if ((code && PENDING_CODES.has(code)) || status === 408 || status === 429 || status === 502 || status === 503 || status === 504) return "pending";
  if (status === 400) return "invalid";
  return "failed";
}
