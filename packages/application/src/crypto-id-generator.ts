import { randomUUID } from "node:crypto";
import type { IdGenerator } from "./ports.js";

/**
 * Production id generator: opaque UUIDs that are collision-safe across
 * restarts and processes. Durable records (orders, payments, users, sessions)
 * must never carry process-local counter ids — a restart would reset the
 * counter and reuse ids. {@link SequentialIdGenerator} stays test-only.
 */
export class CryptoIdGenerator implements IdGenerator {
  nextId(): string {
    return randomUUID();
  }
}
