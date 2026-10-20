import { createHash } from "node:crypto";

/** 32 random bytes, base64url without padding. */
export const GUEST_CHECKOUT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const PRINCIPAL_PATTERN = /^(user:.+|guest:[0-9a-f]{64})$/;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Principal that scopes idempotency keys and unresolved payment intents.
 * Guests are keyed by a hash of their opaque checkout cookie; the raw cookie
 * value is never stored.
 */
export function checkoutPrincipalKey(input: { userId?: string | null; guestToken?: string | null }): string | null {
  if (input.userId) return `user:${input.userId}`;
  if (input.guestToken && GUEST_CHECKOUT_TOKEN_PATTERN.test(input.guestToken)) return `guest:${sha256Hex(input.guestToken)}`;
  return null;
}

export function isCheckoutPrincipalKey(value: string): boolean {
  return PRINCIPAL_PATTERN.test(value);
}

export interface CheckoutIntentShape {
  lines: ReadonlyArray<{ productId: string; sizeId: string; quantity: number }>;
  promoCode?: string | null | undefined;
  delivery?: object | null | undefined;
}

/**
 * Hash of what is being bought: merged sorted lines, normalized promo code and
 * delivery. Independent of JSON byte order so a reordered body cannot open a
 * second intent.
 */
export function checkoutIntentHash(input: CheckoutIntentShape): string {
  const merged = new Map<string, number>();
  for (const line of input.lines) {
    const key = `${line.productId}\u0000${line.sizeId}`;
    merged.set(key, (merged.get(key) ?? 0) + line.quantity);
  }
  const lines = [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, quantity]) => [...key.split("\u0000"), quantity]);
  const promo = input.promoCode?.trim().toUpperCase() || null;
  const delivery = input.delivery
    ? Object.entries(input.delivery as Record<string, unknown>)
        .flatMap(([key, value]) => (typeof value === "string" && value.trim() !== "" ? [[key, value.trim()] as const] : []))
        .sort(([a], [b]) => (a < b ? -1 : 1))
    : null;
  return sha256Hex(JSON.stringify(["intent-v1", lines, promo, delivery]));
}

/** Idempotency-key payload hash: the intent plus who the receipt goes to. */
export function checkoutRequestHash(intentHash: string, customerEmail: string, customerName?: string | null): string {
  return sha256Hex(JSON.stringify(["request-v1", intentHash, customerEmail.trim().toLowerCase(), customerName?.trim() || null]));
}
