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

/** Enable IP trust only on an ingress that overwrites CF-Connecting-IP and
 * prevents direct origin access. Arbitrary browser-provided internal headers
 * are never forwarded. Without that operator setup phone auth fails closed. */
export function customerProxyHeaders(request: Request, trustedCloudflareIngress: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  const csrf = request.headers.get("x-csrf-token");
  if (csrf && /^[a-f0-9]{64}$/.test(csrf)) headers["x-csrf-token"] = csrf;
  const origin = request.headers.get("origin");
  if (origin) headers["x-yubie-browser-origin"] = origin;
  const site = request.headers.get("sec-fetch-site");
  if (site) headers["sec-fetch-site"] = site;
  const ip = trustedCloudflareIngress ? request.headers.get("cf-connecting-ip") : null;
  if (ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip)) headers["x-yubie-client-ip"] = ip;
  return headers;
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
  if (status === 408 || status === 409 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return "ambiguous";
  return "definitive";
}

export interface HeldAttempt {
  key: string;
  fingerprint: string;
  checkoutToken?: string;
}

export const CHECKOUT_ATTEMPT_STORAGE_KEY = "yubie.checkout-attempt.v1";

/** Recovery reads can succeed even when new checkout storage is unavailable. */
export function rememberRecoveredCheckout(storage:Pick<Storage,"getItem"|"setItem">,checkoutToken:string):void {
  try{
    const held=JSON.parse(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)??"null");
    storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY,JSON.stringify({...((held?.key&&held?.fingerprint)?{key:held.key,fingerprint:held.fingerprint}:{}),checkoutToken}));
  }catch{/* The verified server token remains usable without browser persistence. */}
}

/** Only an opaque key and a SHA-256 fingerprint enter storage, never the
 * checkout body (which contains contact/address data). No time-based reset:
 * an unknown provider outcome remains the same attempt after a reload. */
export async function storedAttemptForRequest(storage: Pick<Storage, "getItem" | "setItem">, body: string, freshKey: string): Promise<HeldAttempt> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const fingerprint = Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
  let previous: HeldAttempt | null = null;
  try {
    const parsed = JSON.parse(storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY) ?? "null");
    if (parsed && typeof parsed.key === "string" && /^[a-f0-9-]{36}$/.test(parsed.key) && typeof parsed.fingerprint === "string" && /^[a-f0-9]{64}$/.test(parsed.fingerprint)) previous = parsed;
  } catch { /* A corrupt value is replaced; blocked storage fails on setItem. */ }
  if(previous && previous.fingerprint!==fingerprint)throw new Error("An unresolved checkout must be recovered before changing this attempt");
  const attempt = previous ?? attemptKeyForCart(null, fingerprint, freshKey);
  storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  return attempt;
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

export type CheckoutUiOutcome = "redirect" | "preview" | "pending" | "unavailable" | "sold_out" | "invalid" | "quote_stale" | "failed";

const PENDING_CODES = new Set(["PENDING_RECONCILIATION", "PROVIDER_UNAVAILABLE", "API_TIMEOUT", "IDEMPOTENCY_KEY_REUSED"]);

export function classifyCheckoutResponse(status: number, payload: { code?: unknown; data?: { mode?: unknown; redirectUrl?: unknown; status?: unknown } } | null): CheckoutUiOutcome {
  const data = payload?.data;
  if (status === 201 && data?.mode === "live" && typeof data.redirectUrl === "string") return "redirect";
  if (status >= 200 && status < 300 && data?.status === "preview") return "preview";
  const code = typeof payload?.code === "string" ? payload.code : null;
  if (code === "CHECKOUT_DISABLED" || code === "CHECKOUT_SAFETY_HOLD" || code === "SHIPPING_UNAVAILABLE" || code === "FEATURE_DISABLED" || code === "PROMOTION_UNAVAILABLE") return "unavailable";
  if (code === "INSUFFICIENT_INVENTORY" || code === "UNAVAILABLE_LINE") return "sold_out";
  // Server refused the selected shipping quote (expired / cart changed): the
  // customer re-picks a delivery option; nothing was charged.
  if (code === "SHIPPING_QUOTE_STALE") return "quote_stale";
  if ((code && PENDING_CODES.has(code)) || status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return "pending";
  if (status === 400) return "invalid";
  return "failed";
}
