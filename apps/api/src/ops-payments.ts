import type { Database } from "@yubie/persistence";
import { authorizeOps } from "./ops-assistant.js";

interface PaymentExceptionRow {
  payment_id: string;
  order_id: string;
  checkout_ref: string;
  provider: string;
  payment_status: string;
  order_status: string;
  reconciliation_state: string | null;
  amount: number;
  order_total: number;
  updated_at: string;
}

interface ExceptionCursor {
  updatedAt: string;
  id: string;
}

function decodeCursor(value: string | null): ExceptionCursor | null {
  if (!value) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object"
      || decoded === null
      || !("updatedAt" in decoded)
      || typeof decoded.updatedAt !== "string"
      || !Number.isFinite(Date.parse(decoded.updatedAt))
      || !("id" in decoded)
      || typeof decoded.id !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(decoded.id)
    ) return null;
    return { updatedAt: decoded.updatedAt, id: decoded.id };
  } catch {
    return null;
  }
}

function encodeCursor(row: PaymentExceptionRow): string {
  return Buffer.from(JSON.stringify({ updatedAt: row.updated_at, id: row.payment_id })).toString("base64url");
}

export async function handleOpsPayments(
  request: Request,
  databaseSource: Database | (() => Database) | null,
  requestId = "ops_payments",
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/ops/payments/exceptions") return null;
  if (!authorizeOps(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!databaseSource) {
    return Response.json({ error: "payment_exceptions_unavailable" }, { status: 503 });
  }
  const database = typeof databaseSource === "function" ? databaseSource() : databaseSource;
  if (request.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET" } });
  }

  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const cursorValue = url.searchParams.get("cursor");
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) {
    return Response.json({ error: "invalid_cursor" }, { status: 400 });
  }

  let rows: PaymentExceptionRow[];
  try {
    rows = await database.client.begin(async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return cursor
        ? sql<PaymentExceptionRow[]>`
        SELECT
          order_payments.id AS payment_id,
          orders.id AS order_id,
          orders.checkout_ref,
          order_payments.provider,
          order_payments.status AS payment_status,
          orders.status AS order_status,
          order_payments.reconciliation_state,
          order_payments.amount,
          orders.grand_total_amount AS order_total,
          order_payments.updated_at
        FROM order_payments
        JOIN orders ON orders.id = order_payments.order_id
        WHERE (
          order_payments.reconciliation_state IN (
            'ambiguous', 'ambiguous_create', 'pending_reconciliation', 'attach_failed'
          )
          OR (
            order_payments.amount <> orders.grand_total_amount
            AND order_payments.status IN ('pending', 'succeeded', 'refunded')
          )
          OR (
            order_payments.status = 'succeeded'
            AND orders.status NOT IN ('paid', 'processing', 'shipped', 'completed')
          )
        )
          AND (order_payments.updated_at, order_payments.id)
            < (${cursor.updatedAt}::timestamptz, ${cursor.id})
        ORDER BY order_payments.updated_at DESC, order_payments.id DESC
        LIMIT ${limit + 1}
          `
        : sql<PaymentExceptionRow[]>`
        SELECT
          order_payments.id AS payment_id,
          orders.id AS order_id,
          orders.checkout_ref,
          order_payments.provider,
          order_payments.status AS payment_status,
          orders.status AS order_status,
          order_payments.reconciliation_state,
          order_payments.amount,
          orders.grand_total_amount AS order_total,
          order_payments.updated_at
        FROM order_payments
        JOIN orders ON orders.id = order_payments.order_id
        WHERE (
          order_payments.reconciliation_state IN (
            'ambiguous', 'ambiguous_create', 'pending_reconciliation', 'attach_failed'
          )
          OR (
            order_payments.amount <> orders.grand_total_amount
            AND order_payments.status IN ('pending', 'succeeded', 'refunded')
          )
          OR (
            order_payments.status = 'succeeded'
            AND orders.status NOT IN ('paid', 'processing', 'shipped', 'completed')
          )
        )
        ORDER BY order_payments.updated_at DESC, order_payments.id DESC
          LIMIT ${limit + 1}
          `;
    });
  } catch (error: unknown) {
    const errorCode = typeof error === "object"
      && error !== null
      && "code" in error
      && typeof error.code === "string"
      && /^[A-Z0-9_]{1,32}$/.test(error.code)
      ? error.code
      : "QUERY_FAILED";
    console.error(JSON.stringify({
      level: "error",
      event: "ops.payment_exceptions_query_failed",
      requestId,
      errorCode,
      at: new Date().toISOString(),
    }));
    return Response.json({ error: "payment_exceptions_unavailable" }, { status: 503 });
  }

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return Response.json({
    items: items.map((row) => ({
      paymentId: row.payment_id,
      orderId: row.order_id,
      checkoutRef: row.checkout_ref,
      provider: row.provider,
      paymentStatus: row.payment_status,
      orderStatus: row.order_status,
      reconciliationState: row.reconciliation_state,
      amount: row.amount,
      orderTotal: row.order_total,
      updatedAt: row.updated_at,
    })),
    nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null,
  });
}
