import type { Database } from "../client.js";

export interface AdminOrderReadRow {
  id: string;
  checkoutRef: string;
  status: string;
  amount: number;
  currency: "IDR";
}

export interface AdminPaymentReadRow {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  currency: "IDR";
  reconciliationState: string;
}

export interface AdminReadPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface PageQuery {
  limit: number;
  cursor: string | null;
}

interface KeysetCursor {
  createdAtMicros: string;
  id: string;
}

/** Cursor format `<created_at epoch microseconds>_<id>`; fits the BFF cursor rule. */
function decodeCursor(cursor: string | null): KeysetCursor | null | "invalid" {
  if (cursor === null) return null;
  const match = /^(\d{1,19})_([A-Za-z0-9_-]{1,60})$/.exec(cursor);
  if (!match?.[1] || !match[2]) return "invalid";
  return { createdAtMicros: match[1], id: match[2] };
}

function nextCursor<T extends { id: string; created_micros: string }>(rows: T[], limit: number): string | null {
  if (rows.length <= limit) return null;
  const last = rows[limit - 1];
  return last ? `${last.created_micros}_${last.id}` : null;
}

interface OrderRow {
  id: string;
  checkout_ref: string;
  status: string;
  grand_total_amount: number;
  created_micros: string;
}

interface PaymentRow {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  reconciliation_state: string | null;
  created_micros: string;
}

/**
 * Read-only admin readers. Every query runs in a READ ONLY transaction with a
 * statement timeout, and no row carries customer email, name, or delivery data.
 */
export class PostgresAdminReaders {
  constructor(private readonly database: Database) {}

  async listOrders(query: PageQuery): Promise<AdminReadPage<AdminOrderReadRow>> {
    const cursor = decodeCursor(query.cursor);
    if (cursor === "invalid") throw new RangeError("invalid admin cursor");
    const rows = await this.database.client.begin("read only", async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return cursor
        ? sql<OrderRow[]>`
            SELECT id, checkout_ref, status, grand_total_amount,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM orders
            WHERE ((EXTRACT(EPOCH FROM created_at) * 1000000)::bigint, id)
              < (${cursor.createdAtMicros}::bigint, ${cursor.id})
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit + 1}`
        : sql<OrderRow[]>`
            SELECT id, checkout_ref, status, grand_total_amount,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM orders
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit + 1}`;
    });
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        id: row.id,
        checkoutRef: row.checkout_ref,
        status: row.status,
        amount: row.grand_total_amount,
        currency: "IDR" as const,
      })),
      nextCursor: nextCursor(rows, query.limit),
    };
  }

  async listPayments(query: PageQuery): Promise<AdminReadPage<AdminPaymentReadRow>> {
    const cursor = decodeCursor(query.cursor);
    if (cursor === "invalid") throw new RangeError("invalid admin cursor");
    const rows = await this.database.client.begin("read only", async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return cursor
        ? sql<PaymentRow[]>`
            SELECT id, order_id, status, amount, reconciliation_state,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM order_payments
            WHERE ((EXTRACT(EPOCH FROM created_at) * 1000000)::bigint, id)
              < (${cursor.createdAtMicros}::bigint, ${cursor.id})
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit + 1}`
        : sql<PaymentRow[]>`
            SELECT id, order_id, status, amount, reconciliation_state,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM order_payments
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit + 1}`;
    });
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        id: row.id,
        orderId: row.order_id,
        status: row.status,
        amount: row.amount,
        currency: "IDR" as const,
        reconciliationState: row.reconciliation_state ?? "none",
      })),
      nextCursor: nextCursor(rows, query.limit),
    };
  }
}
