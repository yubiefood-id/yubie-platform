import type { Clock } from "./ports.js";

/**
 * Production clock: every read reflects the real current instant. Use
 * everywhere durability depends on time (session expiry, order timestamps,
 * webhook received-at). {@link FixedClock} stays test-only.
 */
export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
