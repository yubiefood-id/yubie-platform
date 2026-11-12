import type { OperationsOutbox, OperationsOutboxEvent } from "@yubie/application";
import type { Database } from "../client.js";

const OPERATIONS_EVENT_TYPES = ["ops.changed", "ops.payment_reconcile_requested", "inventory.count_applied", "inventory.recall_hold"];

/**
 * Claims rows for ONE disjoint event-type set per instance. Consumers that
 * need other types (e.g. the growth email deliverer) construct a second
 * instance with their own list — the SKIP LOCKED claim plus disjoint type
 * filters means concurrent claimers never take each other's rows.
 */
export class PostgresOperationsOutbox implements OperationsOutbox {
  private readonly types: readonly string[];
  constructor(private readonly database: Database, eventTypes: readonly string[] = OPERATIONS_EVENT_TYPES) {
    if (!eventTypes.length) throw new Error("Operations outbox requires at least one event type");
    this.types = eventTypes;
  }
  async claim(limit: number): Promise<OperationsOutboxEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("Bounded operations outbox batch required");
    const rows = await this.database.client.begin(async tx => tx`
      UPDATE outbox_events SET attempt_count=attempt_count+1,available_at=now()+interval '5 minutes'
      WHERE id IN (SELECT id FROM outbox_events WHERE event_type=ANY(${this.types}) AND status='pending' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT ${limit})
      RETURNING id,event_type,aggregate_id,attempt_count`);
    return rows.map(row => ({ id: row.id, eventType: row.event_type, aggregateId: row.aggregate_id, attempt: row.attempt_count }));
  }
  async complete(event: OperationsOutboxEvent) {
    await this.database.client`UPDATE outbox_events SET status='published',published_at=now(),last_error_code=NULL WHERE id=${event.id} AND status='pending' AND attempt_count=${event.attempt} AND event_type=ANY(${this.types})`;
  }
  async retry(event: OperationsOutboxEvent) {
    await this.database.client`UPDATE outbox_events SET status=${event.attempt >= 10 ? "failed" : "pending"}::outbox_status,available_at=now()+interval '1 minute',last_error_code='OPS_PROCESSING_FAILED' WHERE id=${event.id} AND status='pending' AND attempt_count=${event.attempt} AND event_type=ANY(${this.types})`;
  }
}
