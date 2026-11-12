import type { Database } from "../client.js";

export interface GrowthOutboxEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  attempt: number;
}

const GROWTH_EVENT_TYPES = ["growth.b2b_lead_created"];

/**
 * WA-04: claim/complete/retry for growth outbox events, mirroring the
 * operations-outbox lease pattern: short row-lock claim (FOR UPDATE SKIP
 * LOCKED), five-minute lease, retry after one minute, terminal `failed` after
 * ten attempts. CRM provider I/O never holds the claim transaction.
 */
export class PostgresGrowthOutbox {
  constructor(private readonly database: Database) {}

  async claim(limit: number): Promise<GrowthOutboxEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("Bounded growth outbox batch required");
    const rows = await this.database.client.begin(async tx => tx`
      UPDATE outbox_events SET attempt_count=attempt_count+1, available_at=now()+interval '5 minutes'
      WHERE id IN (SELECT id FROM outbox_events WHERE event_type=ANY(${GROWTH_EVENT_TYPES}) AND status='pending' AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT ${limit})
      RETURNING id,event_type,aggregate_id,attempt_count`);
    return rows.map(row => ({ id: row.id, eventType: row.event_type, aggregateId: row.aggregate_id, attempt: row.attempt_count }));
  }

  async complete(event: GrowthOutboxEvent) {
    await this.database.client`UPDATE outbox_events SET status='published',published_at=now(),last_error_code=NULL WHERE id=${event.id} AND status='pending' AND attempt_count=${event.attempt} AND event_type=ANY(${GROWTH_EVENT_TYPES})`;
  }

  async retry(event: GrowthOutboxEvent, errorCode = "CRM_PROCESSING_FAILED") {
    await this.database.client`UPDATE outbox_events SET status=${event.attempt >= 10 ? "failed" : "pending"}::outbox_status,available_at=now()+interval '1 minute',last_error_code=${errorCode} WHERE id=${event.id} AND status='pending' AND attempt_count=${event.attempt} AND event_type=ANY(${GROWTH_EVENT_TYPES})`;
  }

  async pendingSummary(): Promise<{ count: number; oldestAgeSeconds: number }> {
    const [row] = await this.database.client`
      SELECT count(*)::int AS count, coalesce(max(extract(epoch from now() - available_at))::int, 0) AS oldest_age_seconds
      FROM outbox_events WHERE event_type=ANY(${GROWTH_EVENT_TYPES}) AND status='pending' AND available_at<=now()`;
    return { count: row?.count ?? 0, oldestAgeSeconds: row?.oldest_age_seconds ?? 0 };
  }
}
