import type { OperationsOutbox, OperationsOutboxEvent } from "@yubie/application";
import type { Database } from "../client.js";
const types = ["ops.changed", "ops.payment_reconcile_requested", "inventory.count_applied", "inventory.recall_hold"];
/** Short row-lock claim, then a five-minute lease. Provider I/O never holds a DB transaction. */
export class PostgresOperationsOutbox implements OperationsOutbox {
  constructor(private readonly database: Database) {}
  async claim(limit: number): Promise<OperationsOutboxEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("Bounded operations outbox batch required");
    const rows = await this.database.client.begin(async tx => tx`
      UPDATE outbox_events SET attempt_count=attempt_count+1,available_at=now()+interval '5 minutes'
      WHERE id IN (SELECT id FROM outbox_events WHERE event_type=ANY(${types}) AND status='pending' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT ${limit})
      RETURNING id,event_type,aggregate_id,attempt_count`);
    return rows.map(row => ({ id: row.id, eventType: row.event_type, aggregateId: row.aggregate_id, attempt: row.attempt_count }));
  }
  async complete(event: OperationsOutboxEvent) {
    await this.database.client`UPDATE outbox_events SET status='published',published_at=now(),last_error_code=NULL WHERE id=${event.id} AND status='pending' AND attempt_count=${event.attempt} AND event_type=ANY(${types})`;
  }
  async retry(event: OperationsOutboxEvent) {
    await this.database.client`UPDATE outbox_events SET status=${event.attempt >= 10 ? "failed" : "pending"}::outbox_status,available_at=now()+interval '1 minute',last_error_code='OPS_PROCESSING_FAILED' WHERE id=${event.id} AND status='pending' AND attempt_count=${event.attempt} AND event_type=ANY(${types})`;
  }
}
