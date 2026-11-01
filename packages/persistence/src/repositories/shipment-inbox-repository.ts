import { sql } from "drizzle-orm";
import type { Database } from "../client.js";

/**
 * Pre-ack durable inbox for authenticated Biteship webhooks (ADR-014 step 9).
 * Same contract as payment_notification_inbox: append before 2xx, claim with
 * a lease, terminal finish. Payloads are PII-bounded at the route (<=64KiB)
 * and purged by the webhook cleanup job after processing + 30 days.
 */
export class PostgresShipmentProviderInbox {
  constructor(private readonly database: Database) {}

  async receive(input: { dedupeKey: string; event: string; providerOrderId: string | null; waybillId: string | null; status: string | null; payload: Record<string, unknown>; payloadHash: string }): Promise<"received" | "duplicate"> {
    const rows = await this.database.db.execute(sql`INSERT INTO shipment_provider_inbox (id,dedupe_key,event,provider_order_id,waybill_id,status,payload,payload_hash)
      VALUES (${"sin_" + Math.random().toString(36).slice(2, 14)},${input.dedupeKey},${input.event},${input.providerOrderId},${input.waybillId},${input.status},${JSON.stringify(input.payload)}::jsonb,${input.payloadHash})
      ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`);
    return rows.length === 1 ? "received" : "duplicate";
  }

  async claim(limit: number, now: string): Promise<Array<{ id: string; event: string; providerOrderId: string | null; waybillId: string | null; trackingId: string | null; status: string | null; payload: Record<string, unknown>; attemptCount: number }>> {
    const rows = await this.database.db.execute(sql`WITH due AS (
        SELECT id FROM shipment_provider_inbox WHERE processed_at IS NULL AND retry_after<=${now}::timestamptz ORDER BY received_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      UPDATE shipment_provider_inbox i SET attempt_count=i.attempt_count+1, retry_after=${new Date(Date.parse(now) + 60_000).toISOString()}::timestamptz FROM due WHERE i.id=due.id RETURNING i.*`);
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        event: String(r.event),
        providerOrderId: r.provider_order_id ? String(r.provider_order_id) : null,
        waybillId: r.waybill_id ? String(r.waybill_id) : null,
        trackingId: typeof (r.payload as Record<string, unknown> | null)?.courier_tracking_id === "string" ? String((r.payload as Record<string, unknown>).courier_tracking_id) : null,
        status: r.status ? String(r.status) : null,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        attemptCount: Number(r.attempt_count ?? 0),
      };
    });
  }

  async finish(id: string, terminal: boolean, errorCode?: string): Promise<void> {
    if (terminal) {
      await this.database.db.execute(sql`UPDATE shipment_provider_inbox SET processed_at=now(), last_error_code=${errorCode ?? null} WHERE id=${id}`);
    } else {
      await this.database.db.execute(sql`UPDATE shipment_provider_inbox SET last_error_code=${errorCode ?? null} WHERE id=${id}`);
    }
  }
}
