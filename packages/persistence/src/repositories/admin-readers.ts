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
  search?: string;
  exceptionsOnly?: boolean;
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
    const pattern = searchPattern(query);
    const cursor = decodeCursor(query.cursor);
    if (cursor === "invalid") throw new RangeError("invalid admin cursor");
    const rows = await this.database.client.begin("read only", async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return cursor
        ? sql<OrderRow[]>`
            SELECT id, checkout_ref, status, grand_total_amount,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM orders
            WHERE (id ILIKE ${pattern} OR checkout_ref ILIKE ${pattern})
              AND ((EXTRACT(EPOCH FROM created_at) * 1000000)::bigint, id)
              < (${cursor.createdAtMicros}::bigint, ${cursor.id})
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit + 1}`
        : sql<OrderRow[]>`
            SELECT id, checkout_ref, status, grand_total_amount,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM orders
            WHERE id ILIKE ${pattern} OR checkout_ref ILIKE ${pattern}
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
    const pattern = searchPattern(query);
    const cursor = decodeCursor(query.cursor);
    if (cursor === "invalid") throw new RangeError("invalid admin cursor");
    const rows = await this.database.client.begin("read only", async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return cursor
        ? sql<PaymentRow[]>`
            SELECT id, order_id, status, amount, reconciliation_state,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM order_payments
            WHERE (id ILIKE ${pattern} OR order_id ILIKE ${pattern})
              AND (${!query.exceptionsOnly} OR reconciliation_state IN ('ambiguous', 'ambiguous_create', 'pending_reconciliation', 'attach_failed', 'late_success_after_terminal', 'multiple_successful_transactions'))
              AND ((EXTRACT(EPOCH FROM created_at) * 1000000)::bigint, id)
              < (${cursor.createdAtMicros}::bigint, ${cursor.id})
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit + 1}`
        : sql<PaymentRow[]>`
            SELECT id, order_id, status, amount, reconciliation_state,
              (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
            FROM order_payments
            WHERE (id ILIKE ${pattern} OR order_id ILIKE ${pattern})
              AND (${!query.exceptionsOnly} OR reconciliation_state IN ('ambiguous', 'ambiguous_create', 'pending_reconciliation', 'attach_failed', 'late_success_after_terminal', 'multiple_successful_transactions'))
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

  listExceptions(query: PageQuery) {
    return this.listPayments({ ...query, exceptionsOnly: true });
  }

  async listInventory(query: PageQuery) {
    const pattern = searchPattern(query);
    const cursor = decodeCursor(query.cursor);
    if (cursor === "invalid") throw new RangeError("invalid admin cursor");
    const rows = await this.database.client.begin("read only", async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return sql<Array<{ id: string; product_id: string; size_id: string; quantity_on_hand: number; status: string; expiry_date: string; created_micros: string }>>`
        SELECT id, product_id, size_id, quantity_on_hand, status, expiry_date::text,
          (EXTRACT(EPOCH FROM created_at) * 1000000)::bigint::text AS created_micros
        FROM inventory_lots
        WHERE (id ILIKE ${pattern} OR product_id ILIKE ${pattern})
          AND (${cursor === null} OR ((EXTRACT(EPOCH FROM created_at) * 1000000)::bigint, id) < (${cursor?.createdAtMicros ?? "0"}::bigint, ${cursor?.id ?? ""}))
        ORDER BY created_at DESC, id DESC
        LIMIT ${query.limit + 1}`;
    });
    return {
      items: rows.slice(0, query.limit).map((row) => ({ id: row.id, productId: row.product_id, sizeId: row.size_id, quantity: row.quantity_on_hand, status: row.status, expiryDate: row.expiry_date })),
      nextCursor: nextCursor(rows, query.limit),
    };
  }
}

function searchPattern(query: PageQuery): string {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50 || (query.search?.length ?? 0) > 80) throw new RangeError("invalid admin query");
  return `%${(query.search ?? "").replace(/[\\%_]/g, "\\$&")}%`;
}
