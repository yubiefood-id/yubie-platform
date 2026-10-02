import { err, ok } from "@yubie/domain";
import type {
  AuditRepository,
  IdempotencyClaim,
  IdempotencyClaimOutcome,
  IdempotencyRepository,
  OutboxRepository,
  TransactionManager,
  TransactionalRepositories,
  WebhookInboxAppendOutcome,
  WebhookInboxRecordInput,
  WebhookInboxRepository,
} from "../ports.js";

/** Test/local audit sink (mirrors PostgresAuditRepository). */
export class InMemoryAuditRepository implements AuditRepository {
  readonly events: Array<{ action: string; resourceType: string; resourceId: string; actor: string; occurredAt: string }> = [];

  async append(event: { action: string; resourceType: string; resourceId: string; actor: string; occurredAt: string }) {
    this.events.push(event);
    return ok(undefined);
  }
}

/** Test/local outbox sink (mirrors PostgresOutboxRepository). */
export class InMemoryOutboxRepository implements OutboxRepository {
  readonly events: Array<{ eventType: string; aggregateType: string; aggregateId: string; dedupeKey: string; payloadJson: string; availableAt: string }> = [];

  async enqueue(event: { eventType: string; aggregateType: string; aggregateId: string; dedupeKey: string; payloadJson: string; availableAt: string }) {
    this.events.push(event);
    return ok(undefined);
  }
}

/**
 * Test/local idempotency claims. Same contract as the Postgres
 * implementation: same key + same hash = duplicate (with stored response);
 * same key + different hash = conflict.
 */
export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly claims = new Map<string, { requestHash: string; responseJson: string | null }>();

  async claim(record: IdempotencyClaim) {
    const composite = `${record.scope}:${record.principalKey}:${record.operation}:${record.idempotencyKey}`;
    const existing = this.claims.get(composite);
    if (existing) {
      if (existing.requestHash === record.requestHash) {
        return ok<IdempotencyClaimOutcome>({ status: "duplicate", responseJson: existing.responseJson });
      }
      return err({
        code: "conflict",
        message: "Idempotency key reused with different request",
        retryable: false,
        requestId: "idempotency",
      });
    }
    this.claims.set(composite, { requestHash: record.requestHash, responseJson: null });
    return ok<IdempotencyClaimOutcome>({ status: "claimed" });
  }

  async attachResponse(record: Omit<IdempotencyClaim, "createdAt" | "requestHash">, responseJson: string) {
    const composite = `${record.scope}:${record.principalKey}:${record.operation}:${record.idempotencyKey}`;
    const existing = this.claims.get(composite);
    if (existing) this.claims.set(composite, { ...existing, responseJson });
    return ok(undefined);
  }
}

/** Test/local webhook inbox (mirrors the Postgres webhook_inbox semantics). */
export class InMemoryWebhookInboxRepository implements WebhookInboxRepository {
  private readonly deliveries = new Set<string>();

  async recordProcessed(input: WebhookInboxRecordInput): Promise<{ ok: true; value: WebhookInboxAppendOutcome }> {
    const composite = `${input.provider}:${input.deliveryId}`;
    if (this.deliveries.has(composite)) return ok("duplicate");
    this.deliveries.add(composite);
    return ok("inserted");
  }
}

/**
 * Test/local TransactionManager: no real atomicity, but interface parity so
 * use cases are exercised against the same transactional shape. Production
 * wires PostgresTransactionManager from @yubie/persistence.
 */
export class InMemoryTransactionManager implements TransactionManager {
  constructor(private readonly repos: TransactionalRepositories) {}

  async run<T>(_operation: string, work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return work(this.repos);
  }
}
