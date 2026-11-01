import { sql } from "drizzle-orm";
import { canTransitionShipment, type ShipmentStatus } from "@yubie/domain";
import type { Database } from "../client.js";


/**
 * Shipment lifecycle store (ADR-014 steps 5-9). Every mutating method runs
 * inside the caller's transaction; provider HTTP happens in the worker, never
 * here. The dispatch lease is the write-ahead record: it is persisted and
 * COMMITted before any Biteship call so a crash can never lose or duplicate
 * a booking intent.
 */
export class PostgresShipmentRepository {
  constructor(private readonly database: Database) {}

  /** Idempotently create the not_ready shipment for a courier-paid order (payment success). */
  async ensureForPaidOrder(input: { orderId: string; checkoutRef: string; shipping: { policy: string; quoteId?: string | undefined; amount: number; providerAmountIdr?: number | undefined; subsidyAmountIdr?: number | undefined; taxAmountIdr?: number | undefined } | null; currency: string }, now: string): Promise<"created" | "existing" | "skipped"> {
    if (!input.shipping || input.shipping.policy !== "courier") return "skipped";
    const id = `shp_${sqlFraction(input.orderId)}`;
    const rows = await this.database.db.execute(sql`INSERT INTO shipments
      (id,order_id,package_index,dispatch_generation,reference_id,status,quote_id,quoted_amount_idr,currency,weight_grams,version,created_at,updated_at)
      VALUES (${id},${input.orderId},0,1,${`ybshp-${sanitizeRef(input.checkoutRef)}-p0-g1`},'not_ready',${input.shipping.quoteId ?? null},${input.shipping.amount},${input.currency === "IDR" ? "IDR" : "IDR"},null,1,${now}::timestamptz,${now}::timestamptz)
      ON CONFLICT(order_id,package_index) DO NOTHING RETURNING id`);
    if (rows.length === 0) return "existing";
    await this.database.db.execute(sql`INSERT INTO shipment_finance_events (id,shipment_id,order_id,kind,amount_idr,currency,provider_ref,policy_version,snapshot,created_at)
      VALUES (${`fin_${sqlFraction(input.orderId)}_charge`},${id},${input.orderId},'customer_charged',${input.shipping.amount},'IDR',${input.shipping.quoteId ?? null},'order-snapshot', ${JSON.stringify({ quotedAmountIdr: input.shipping.amount, providerAmountIdr: input.shipping.providerAmountIdr ?? null, subsidyAmountIdr: input.shipping.subsidyAmountIdr ?? null, taxAmountIdr: input.shipping.taxAmountIdr ?? null })}::jsonb,${now}::timestamptz)
      ON CONFLICT DO NOTHING`);
    return "created";
  }

  /** Staff packed the physical package: shipment ready + a pending dispatch intent, atomically. */
  async markReadyForDispatch(input: { orderId: string; weightGrams: number | null; actor: string }, now: string): Promise<void> {
    await this.database.db.execute(sql`UPDATE shipments SET status='ready', weight_grams=COALESCE(${input.weightGrams ?? null},weight_grams), version=version+1, updated_at=${now}::timestamptz WHERE order_id=${input.orderId} AND status IN ('not_ready','failed','held')`);
    await this.database.db.execute(sql`INSERT INTO shipment_dispatch_intents (id,shipment_id,generation,reference_id,state,attempts,max_attempts,created_at,updated_at)
      SELECT 'int_' || left(md5(s.id), 12) || '_g' || s.dispatch_generation, s.id, s.dispatch_generation, s.reference_id, 'pending', 0, 5, ${now}::timestamptz, ${now}::timestamptz
      FROM shipments s WHERE s.order_id=${input.orderId} AND s.status='ready'
      ON CONFLICT(shipment_id,generation) DO UPDATE SET state='pending', updated_at=EXCLUDED.updated_at`);
  }

  /**
   * Lease up to `limit` ready dispatch intents (pending, or leased with an
   * expired lease) and flip their shipments to booking_pending, returning the
   * booking context. COMMIT before the provider call.
   */
  async claimDispatchIntents(limit: number, now: string, leaseMs: number): Promise<DispatchLease[]> {
    // postgres.js tagged template (not drizzle execute): drizzle's prepared
    // path drops the RETURNING rows of this CTE-UPDATE shape in pg driver 2.x.
    const rows = await (this.database.client as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ id: string; shipment_id: string; attempts: number; max_attempts: number }>>)`WITH claimed AS (
        SELECT i.id FROM shipment_dispatch_intents i
        JOIN shipments s ON s.id=i.shipment_id
        WHERE (i.state='pending' OR (i.state='leased' AND i.lease_expires_at<${now}::timestamptz)) AND s.status IN ('ready','booking_pending')
        ORDER BY i.created_at LIMIT ${limit} FOR UPDATE OF i SKIP LOCKED)
      UPDATE shipment_dispatch_intents i SET state='leased', attempts=i.attempts+1, lease_expires_at=${new Date(Date.parse(now) + leaseMs).toISOString()}::timestamptz, updated_at=${now}::timestamptz
      FROM claimed WHERE i.id=claimed.id RETURNING i.id, i.shipment_id, i.attempts, i.max_attempts`;
    if (rows.length === 0) return [];
    const leases: DispatchLease[] = [];
    for (const claimed of rows) {
      const context = await this.database.db.execute(sql`SELECT s.id AS shipment_id, s.order_id, s.reference_id, s.dispatch_generation, s.quote_id, s.weight_grams,
          o.checkout_ref, o.customer_name, o.customer_phone, o.delivery_jsonb, o.shipping_jsonb, o.lines_jsonb, o.currency,
          q.courier_company, q.courier_service_code, q.courier_service_name, q.service_type, q.delivery_type,
          org.contact_name AS origin_contact_name, org.contact_phone AS origin_contact_phone, org.address AS origin_address, org.postal_code AS origin_postal_code, org.latitude AS origin_latitude, org.longitude AS origin_longitude
        FROM shipments s
        JOIN orders o ON o.id=s.order_id
        LEFT JOIN shipping_quotes q ON q.id=s.quote_id
        LEFT JOIN shipping_origins org ON org.id=q.origin_id
        WHERE s.id=${claimed.shipment_id}`);
      const c = context[0];
      if (!c) continue;
      await this.database.db.execute(sql`UPDATE shipments SET status='booking_pending', version=version+1, updated_at=${now}::timestamptz WHERE id=${c.shipment_id}`);
      leases.push({ ...mapLease(c), intentId: claimed.id, attempts: claimed.attempts, maxAttempts: claimed.max_attempts });
    }
    return leases;
  }

  /** Provider accepted the booking (or a reference-conflict recovery verified by getOrder). */
  async recordBookingAccepted(input: { intentId: string; shipmentId: string; orderId: string; providerOrderId: string; referenceId: string; priceIdr: number | null; waybillId: string | null; trackingId: string | null; trackingUrl: string | null; courierCompany: string | null; courierType: string | null; rawStatus: string | null }, now: string): Promise<void> {
    await this.database.db.execute(sql`UPDATE shipments SET status='booked', provider_order_id=${input.providerOrderId}, courier_company=COALESCE(${input.courierCompany},courier_company), courier_service=COALESCE(courier_service,${input.courierCompany}), courier_type=COALESCE(courier_type,${input.courierType}), waybill_id=COALESCE(${input.waybillId},waybill_id), tracking_id=COALESCE(${input.trackingId},tracking_id), tracking_url=COALESCE(${input.trackingUrl},tracking_url), actual_amount_idr=COALESCE(${input.priceIdr},actual_amount_idr), latest_provider_status=${input.rawStatus}, version=version+1, updated_at=${now}::timestamptz WHERE id=${input.shipmentId} AND status IN ('booking_pending','booking_unknown','ready')`);
    await this.database.db.execute(sql`UPDATE shipment_dispatch_intents SET state='complete', updated_at=${now}::timestamptz WHERE id=${input.intentId}`);
    if (input.priceIdr !== null) {
      await this.database.db.execute(sql`INSERT INTO shipment_finance_events (id,shipment_id,order_id,kind,amount_idr,currency,provider_ref,snapshot,created_at)
        VALUES (${`fin_${sqlFraction(input.shipmentId)}_booked`},${input.shipmentId},${input.orderId},'provider_booked',${input.priceIdr},'IDR',${input.providerOrderId},${JSON.stringify({ referenceId: input.referenceId, rawStatus: input.rawStatus })}::jsonb,${now}::timestamptz) ON CONFLICT DO NOTHING`);
    }
  }

  /** Definitive provider refusal (validation): intent dead or retried on a new generation by ops. */
  async recordBookingRefused(input: { intentId: string; shipmentId: string; errorCode: string; attempts: number; maxAttempts: number }, now: string): Promise<void> {
    const dead = input.attempts >= input.maxAttempts;
    await this.database.db.execute(sql`UPDATE shipment_dispatch_intents SET state=${dead ? "dead" : "pending"}, last_error_code=${input.errorCode}, updated_at=${now}::timestamptz WHERE id=${input.intentId}`);
    await this.database.db.execute(sql`UPDATE shipments SET status=${dead ? "failed" : "ready"}, version=version+1, updated_at=${now}::timestamptz WHERE id=${input.shipmentId} AND status='booking_pending'`);
  }

  /** Ambiguous provider outcome: freeze for reconciliation; never blind-retry. */
  async recordBookingUnknown(input: { intentId: string; shipmentId: string; errorCode: string }, now: string): Promise<void> {
    await this.database.db.execute(sql`UPDATE shipment_dispatch_intents SET state='unknown', last_error_code=${input.errorCode}, updated_at=${now}::timestamptz WHERE id=${input.intentId}`);
    await this.database.db.execute(sql`UPDATE shipments SET status='booking_unknown', version=version+1, updated_at=${now}::timestamptz WHERE id=${input.shipmentId} AND status IN ('booking_pending','ready')`);
  }

  /** Attempt to advance the physical chain with a monotonic guard; returns the effective status. */
  async applyProviderStatus(input: { providerOrderId: string; neutralStatus: string; waybillId: string | null; trackingId: string | null; trackingUrl: string | null; rawStatus: string; occurredAt: string }, canAdvance: (current: string, observed: string) => boolean): Promise<{ applied: boolean; shipment: { id: string; orderId: string; status: string } | null }> {
    const rows = await this.database.db.execute(sql`SELECT id,order_id,status FROM shipments WHERE provider_order_id=${input.providerOrderId} FOR UPDATE`);
    const row = rows[0] as { id: string; order_id: string; status: string } | undefined;
    if (!row) return { applied: false, shipment: null };
    if (!canAdvance(row.status, input.neutralStatus)) {
      await this.database.db.execute(sql`UPDATE shipments SET latest_provider_status=${input.rawStatus}, last_provider_event_at=${input.occurredAt}::timestamptz, updated_at=${input.occurredAt}::timestamptz WHERE id=${row.id}`);
      return { applied: false, shipment: { id: row.id, orderId: row.order_id, status: row.status } };
    }
    await this.database.db.execute(sql`UPDATE shipments SET status=${input.neutralStatus}, waybill_id=COALESCE(${input.waybillId},waybill_id), tracking_id=COALESCE(${input.trackingId},tracking_id), tracking_url=COALESCE(${input.trackingUrl},tracking_url), latest_provider_status=${input.rawStatus}, last_provider_event_at=${input.occurredAt}::timestamptz, version=version+1, updated_at=${input.occurredAt}::timestamptz WHERE id=${row.id}`);
    return { applied: true, shipment: { id: row.id, orderId: row.order_id, status: input.neutralStatus } };
  }

  /** Provider price change: Yubie expense/review event; the customer total never moves. */
  async recordPriceChange(input: { providerOrderId: string; priceIdr: number; shippingFeeIdr: number | null; occurredAt: string }, now: string): Promise<void> {
    const rows = await this.database.db.execute(sql`SELECT id,order_id,quoted_amount_idr,actual_amount_idr FROM shipments WHERE provider_order_id=${input.providerOrderId}`);
    const row = rows[0] as { id: string; order_id: string; quoted_amount_idr: number | null; actual_amount_idr: number | null } | undefined;
    if (!row) return;
    await this.database.db.execute(sql`UPDATE shipments SET actual_amount_idr=${input.priceIdr}, version=version+1, updated_at=${now}::timestamptz WHERE id=${row.id}`);
    await this.database.db.execute(sql`INSERT INTO shipment_finance_events (id,shipment_id,order_id,kind,amount_idr,currency,provider_ref,snapshot,created_at)
      VALUES (${`fin_${sqlFraction(row.id)}_price_${Date.parse(input.occurredAt)}`},${row.id},${row.order_id},'price_adjustment',${input.priceIdr},'IDR',${input.providerOrderId},${JSON.stringify({ shippingFeeIdr: input.shippingFeeIdr, quotedAmountIdr: row.quoted_amount_idr, previousActualIdr: row.actual_amount_idr })}::jsonb,${now}::timestamptz) ON CONFLICT DO NOTHING`);
  }

  /** Exceptional provider statuses (cancelled/lost/returned): guarded by the domain transition map. */
  async applyProviderExceptional(providerOrderId: string, status: ShipmentStatus, now: string): Promise<boolean> {
    const rows = await this.database.db.execute(sql`SELECT id,status FROM shipments WHERE provider_order_id=${providerOrderId} FOR UPDATE`);
    const row = rows[0] as { id: string; status: string } | undefined;
    if (!row) return false;
    if (!canTransitionShipment(row.status as ShipmentStatus, status)) return false;
    await this.database.db.execute(sql`UPDATE shipments SET status=${status}, version=version+1, updated_at=${now}::timestamptz WHERE id=${row.id}`);
    return true;
  }

  async findByProviderOrderId(providerOrderId: string): Promise<{ id: string; orderId: string; status: string; waybillId: string | null; courierCompany: string | null } | null> {
    const rows = await this.database.db.execute(sql`SELECT id,order_id,status,waybill_id,courier_company FROM shipments WHERE provider_order_id=${providerOrderId}`);
    const row = rows[0] as { id: string; order_id: string; status: string; waybill_id: string | null; courier_company: string | null } | undefined;
    return row ? { id: row.id, orderId: row.order_id, status: row.status, waybillId: row.waybill_id, courierCompany: row.courier_company } : null;
  }

  /** Pilot budget guard: booked shipments + committed provider cost inside the window. */
  async pilotUsage(now: string): Promise<{ bookings: number; committedIdr: number }> {
    const rows = await this.database.db.execute(sql`SELECT COUNT(*)::int AS bookings, COALESCE(SUM(COALESCE(actual_amount_idr,quoted_amount_idr,0)),0)::int AS committed FROM shipments WHERE status NOT IN ('cancelled','failed','returned') AND provider_order_id IS NOT NULL AND created_at > ${now}::timestamptz - interval '30 days'`);
    const row = rows[0] as { bookings: number; committed: number };
    return { bookings: row.bookings, committedIdr: row.committed };
  }
}

export interface DispatchLease {
  intentId: string;
  attempts: number;
  maxAttempts: number;
  shipmentId: string;
  orderId: string;
  referenceId: string;
  dispatchGeneration: number;
  quoteId: string | null;
  weightGrams: number | null;
  checkoutRef: string;
  customerName: string | null;
  customerPhone: string | null;
  delivery: Record<string, unknown> | null;
  shipping: Record<string, unknown> | null;
  lines: unknown[];
  courierCompany: string | null;
  courierServiceCode: string | null;
  courierServiceName: string | null;
  courierType: string | null;
  deliveryType: string | null;
  origin: { contactName: string; contactPhone: string; address: string; postalCode: string | null } | null;
}

function mapLease(c: Record<string, unknown>): Omit<DispatchLease, "intentId" | "attempts" | "maxAttempts"> {
  const delivery = (c.delivery_jsonb ?? null) as Record<string, unknown> | null;
  const shipping = (c.shipping_jsonb ?? null) as Record<string, unknown> | null;
  const originPresent = Boolean(c.origin_address);
  return {
    shipmentId: String(c.shipment_id),
    orderId: String(c.order_id),
    referenceId: String(c.reference_id),
    dispatchGeneration: Number(c.dispatch_generation),
    quoteId: c.quote_id ? String(c.quote_id) : null,
    weightGrams: c.weight_grams === null || c.weight_grams === undefined ? null : Number(c.weight_grams),
    checkoutRef: String(c.checkout_ref),
    customerName: c.customer_name ? String(c.customer_name) : null,
    customerPhone: c.customer_phone ? String(c.customer_phone) : null,
    delivery,
    shipping,
    lines: Array.isArray(c.lines_jsonb) ? c.lines_jsonb : [],
    courierCompany: c.courier_company ? String(c.courier_company) : null,
    courierServiceCode: c.courier_service_code ? String(c.courier_service_code) : null,
    courierServiceName: c.courier_service_name ? String(c.courier_service_name) : null,
    courierType: c.service_type ? String(c.service_type) : null,
    deliveryType: c.delivery_type ? String(c.delivery_type) : null,
    origin: originPresent
      ? { contactName: String(c.origin_contact_name), contactPhone: String(c.origin_contact_phone), address: String(c.origin_address), postalCode: c.origin_postal_code ? String(c.origin_postal_code) : null }
      : null,
  };
}

/**
 * Postgres.js-tag variant used inside PostgresOperations.fulfill, whose
 * transaction handle is a raw TransactionSql, not a drizzle Database.
 */
export async function markShipmentReadyForDispatchTx(tx: unknown, input: { orderId: string; weightGrams: number | null; actor: string }, now: string): Promise<void> {
  const run = (tx as { unsafe: (query: string, values?: unknown[]) => Promise<unknown[]> }).unsafe.bind(tx) as (query: string, values: unknown[]) => Promise<unknown[]>;
  await run("UPDATE shipments SET status='ready', weight_grams=COALESCE($1,weight_grams), version=version+1, updated_at=$2::timestamptz WHERE order_id=$3 AND status IN ('not_ready','failed','held')", [input.weightGrams, now, input.orderId]);
  await run("INSERT INTO shipment_dispatch_intents (id,shipment_id,generation,reference_id,state,attempts,max_attempts,created_at,updated_at) SELECT 'int_' || left(md5(s.id), 12) || '_g' || s.dispatch_generation, s.id, s.dispatch_generation, s.reference_id, 'pending', 0, 5, $2::timestamptz, $2::timestamptz FROM shipments s WHERE s.order_id=$1 AND s.status='ready' ON CONFLICT(shipment_id,generation) DO UPDATE SET state='pending', updated_at=EXCLUDED.updated_at", [input.orderId, now]);
}

function sanitizeRef(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}

function sqlFraction(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
