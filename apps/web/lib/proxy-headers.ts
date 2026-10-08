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
export function nextAttemptKey(previous: string | null, outcome: "ambiguous" | "definitive" | "reset", freshKey: string): string | null {
  if (outcome === "ambiguous") return previous ?? freshKey;
  return null;
}
