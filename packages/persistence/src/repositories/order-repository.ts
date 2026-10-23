import { and, asc, desc, eq, isNotNull, lt, inArray, or, sql } from "drizzle-orm";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { OrderLineRecord, OrderRecord, OrderShipping, PaymentEventRecord, PaymentRecord } from "@yubie/domain";
import { DuplicatePaymentIntentError } from "@yubie/application";
import type { OrderRepository, PaymentEventAppendOutcome, PaymentEventRepository, PaymentRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { checkoutGuestBindings, firstPartyOrders, orderPayments, paymentEvents } from "../schema/index.js";

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly database: Database) {}

  async findById(id: string) {
    const rows = await this.database.db.select().from(firstPartyOrders).where(eq(firstPartyOrders.id, id)).limit(1);
    return ok(rows[0] ? mapOrderRow(rows[0]) : null);
  }

  async findByCheckoutRef(checkoutRef: string) {
    const rows = await this.database.db.select().from(firstPartyOrders).where(eq(firstPartyOrders.checkoutRef, checkoutRef)).limit(1);
    return ok(rows[0] ? mapOrderRow(rows[0]) : null);
  }

  async findByPublicToken(token: string) {
    const rows = await this.database.db.select().from(firstPartyOrders).where(eq(firstPartyOrders.checkoutPublicToken, token)).limit(1);
    return ok(rows[0] ? mapOrderRow(rows[0]) : null);
  }

  async listForUser(userId: string) {
    const rows = await this.database.db.select().from(firstPartyOrders).where(eq(firstPartyOrders.userId, userId)).orderBy(desc(firstPartyOrders.createdAt));
    return ok(rows.map(mapOrderRow));
  }

  async listStaleDrafts(olderThan: string, limit: number) {
    const rows = await this.database.db.select().from(firstPartyOrders)
      .where(and(eq(firstPartyOrders.status, "draft"), lt(firstPartyOrders.createdAt, olderThan)))
      .orderBy(asc(firstPartyOrders.createdAt))
      .limit(limit);
    return ok(rows.map(mapOrderRow));
  }

  async save(order: OrderRecord) {
    await this.database.db.insert(firstPartyOrders).values({
      id: order.id,
      checkoutRef: order.checkoutRef,
      checkoutPublicToken: order.checkoutPublicToken,
      status: order.status,
      userId: order.userId,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone ?? null,
      customerName: order.customerName,
      deliveryJsonb: order.delivery,
      currency: order.currency,
      subtotalAmount: order.totals.subtotalAmount,
      shippingAmount: order.totals.shippingAmount,
      discountAmount: order.totals.discountAmount,
      taxAmount: order.totals.taxAmount,
      grandTotalAmount: order.totals.grandTotalAmount,
      totalAmount: order.totalAmount,
      shippingJsonb: order.shipping,
      linesJsonb: order.lines,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }).onConflictDoUpdate({
      target: firstPartyOrders.id,
      set: {
        status: order.status,
        customerEmail: order.customerEmail,
      customerPhone: order.customerPhone ?? null,
        customerName: order.customerName,
        subtotalAmount: order.totals.subtotalAmount,
        shippingAmount: order.totals.shippingAmount,
        discountAmount: order.totals.discountAmount,
        taxAmount: order.totals.taxAmount,
        grandTotalAmount: order.totals.grandTotalAmount,
        totalAmount: order.totalAmount,
        shippingJsonb: order.shipping,
        linesJsonb: order.lines,
        updatedAt: order.updatedAt,
      },
    });
    return ok(undefined);
  }
}

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly database: Database) {}

  async findCheckoutGuestOwner(guestPrincipal: string): Promise<string | null> {
    const [row] = await this.database.db.select().from(checkoutGuestBindings).where(eq(checkoutGuestBindings.guestPrincipal, guestPrincipal)).limit(1);
    return row?.userId ?? null;
  }
  async listCheckoutGuestPrincipals(userId: string): Promise<string[]> {
    const rows = await this.database.db.select().from(checkoutGuestBindings).where(eq(checkoutGuestBindings.userId, userId)).limit(101);
    return rows.map(row => row.guestPrincipal);
  }
  async bindCheckoutGuest(guestPrincipal: string, userId: string, now: string): Promise<boolean> {
    await this.database.db.insert(checkoutGuestBindings).values({ guestPrincipal, userId, linkedAt: now }).onConflictDoNothing();
    return await this.findCheckoutGuestOwner(guestPrincipal) === userId;
  }

  async lockCheckoutPrincipals(principals: string[]): Promise<void> {
    for (const principal of [...new Set(principals)].sort()) {
      await this.database.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"checkout:" + principal},0))`);
    }
  }

  async findUnresolvedByPrincipals(principals: string[]): Promise<UseCaseResult<PaymentRecord[]>> {
    if (!principals.length) return ok([]);
    const rows = await this.database.db.select().from(orderPayments).where(and(
      inArray(orderPayments.principalKey, principals),
      or(eq(orderPayments.status, "pending"), inArray(orderPayments.reconciliationState, ["late_success_after_terminal", "multiple_successful_transactions"])),
    )).limit(2);
    return ok(rows.map(mapPaymentRow));
  }

  async findById(id: string) {
    const rows = await this.database.db.select().from(orderPayments).where(eq(orderPayments.id, id)).limit(1);
    return ok(rows[0] ? mapPaymentRow(rows[0]) : null);
  }

  /** Row-locked read inside the caller's transaction (SELECT ... FOR UPDATE). */
  async lockById(id: string) {
    const rows = await this.database.db.select().from(orderPayments).where(eq(orderPayments.id, id)).limit(1).for("update");
    return ok(rows[0] ? mapPaymentRow(rows[0]) : null);
  }

  async findByProviderSession(provider: string, providerSessionId: string) {
    const rows = await this.database.db.select().from(orderPayments)
      .where(and(eq(orderPayments.provider, provider), eq(orderPayments.providerSessionId, providerSessionId)))
      .limit(1);
    return ok(rows[0] ? mapPaymentRow(rows[0]) : null);
  }

  async findByOrderId(orderId: string) {
    const rows = await this.database.db.select().from(orderPayments).where(eq(orderPayments.orderId, orderId)).orderBy(desc(orderPayments.createdAt));
    return ok(rows.map(mapPaymentRow));
  }

  async findUnresolvedByPrincipalHash(principalKey: string, requestHash: string) {
    const rows = await this.database.db.select().from(orderPayments)
      .where(and(
        eq(orderPayments.principalKey, principalKey),
        eq(orderPayments.requestHash, requestHash),
        eq(orderPayments.status, "pending"),
      ))
      .limit(1);
    return ok(rows[0] ? mapPaymentRow(rows[0]) : null);
  }

  async listPendingExpired(now: string, limit: number) {
    const rows = await this.database.db.select().from(orderPayments)
      .where(and(eq(orderPayments.status, "pending"), isNotNull(orderPayments.expiresAt), lt(orderPayments.expiresAt, now)))
      .orderBy(asc(orderPayments.expiresAt))
      .limit(limit);
    return ok(rows.map(mapPaymentRow));
  }

  async save(payment: PaymentRecord) {
    try {
      await this.insertOrUpdate(payment);
    } catch (error) {
      if (isUnresolvedIntentViolation(error)) throw new DuplicatePaymentIntentError();
      throw error;
    }
    return ok(undefined);
  }

  private async insertOrUpdate(payment: PaymentRecord) {
    await this.database.db.insert(orderPayments).values({
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      providerSessionId: payment.providerSessionId,
      redirectUrl: payment.redirectUrl,
      currency: payment.currency,
      amount: payment.amount,
      status: payment.status,
      expiresAt: payment.expiresAt,
      ...(payment.providerBusinessId !== undefined ? { providerBusinessId: payment.providerBusinessId } : {}),
      ...(payment.providerPaymentId !== undefined ? { providerPaymentId: payment.providerPaymentId } : {}),
      ...(payment.reconciliationState !== undefined ? { reconciliationState: payment.reconciliationState } : {}),
      ...(payment.principalKey !== undefined ? { principalKey: payment.principalKey } : {}),
      ...(payment.requestHash !== undefined ? { requestHash: payment.requestHash } : {}),
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    }).onConflictDoUpdate({
      target: orderPayments.id,
      set: {
        providerSessionId: payment.providerSessionId,
        status: payment.status,
        redirectUrl: payment.redirectUrl,
        expiresAt: payment.expiresAt,
        ...(payment.providerBusinessId !== undefined ? { providerBusinessId: payment.providerBusinessId } : {}),
        ...(payment.providerPaymentId !== undefined ? { providerPaymentId: payment.providerPaymentId } : {}),
        ...(payment.reconciliationState !== undefined ? { reconciliationState: payment.reconciliationState } : {}),
        updatedAt: payment.updatedAt,
      },
    });
  }
}

function isUnresolvedIntentViolation(error: unknown): boolean {
  for (let current: unknown = error; current && typeof current === "object"; current = (current as { cause?: unknown }).cause) {
    const candidate = current as { code?: unknown; constraint_name?: unknown };
    if (candidate.code === "23505" && candidate.constraint_name === "order_payments_unresolved_request") return true;
  }
  return false;
}

export class PostgresPaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly database: Database) {}

  async recordOnce(event: PaymentEventRecord): Promise<UseCaseResult<PaymentEventAppendOutcome>> {
    const inserted = await this.database.db.insert(paymentEvents).values({
      id: event.id,
      paymentId: event.paymentId,
      dedupeKey: event.dedupeKey,
      event: event.event,
      outcome: event.outcome,
      receivedAt: event.receivedAt,
    }).onConflictDoNothing({ target: paymentEvents.dedupeKey }).returning({ id: paymentEvents.id });
    return ok<PaymentEventAppendOutcome>(inserted.length > 0 ? "inserted" : "duplicate");
  }

  async listForPayment(paymentId: string) {
    const rows = await this.database.db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, paymentId));
    return ok(rows.map((row) => ({
      id: row.id,
      paymentId: row.paymentId,
      dedupeKey: row.dedupeKey,
      event: row.event,
      outcome: row.outcome,
      receivedAt: row.receivedAt,
    } satisfies PaymentEventRecord)));
  }
}

function mapOrderRow(row: typeof firstPartyOrders.$inferSelect): OrderRecord {
  return {
    id: row.id,
    checkoutRef: row.checkoutRef,
    checkoutPublicToken: row.checkoutPublicToken,
    status: row.status as OrderRecord["status"],
    userId: row.userId,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    customerName: row.customerName,
    delivery: (row.deliveryJsonb as OrderRecord["delivery"]) ?? null,
    currency: "IDR",
    totals: {
      subtotalAmount: row.subtotalAmount,
      shippingAmount: row.shippingAmount,
      discountAmount: row.discountAmount,
      taxAmount: row.taxAmount,
      grandTotalAmount: row.grandTotalAmount,
    },
    totalAmount: row.totalAmount,
    shipping: (row.shippingJsonb as OrderShipping | null) ?? null,
    lines: (row.linesJsonb as OrderLineRecord[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPaymentRow(row: typeof orderPayments.$inferSelect): PaymentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider as PaymentRecord["provider"],
    providerSessionId: row.providerSessionId,
    redirectUrl: row.redirectUrl,
    currency: "IDR",
    amount: row.amount,
    status: row.status as PaymentRecord["status"],
    expiresAt: row.expiresAt,
    ...(row.providerBusinessId !== null ? { providerBusinessId: row.providerBusinessId } : {}),
    ...(row.providerPaymentId !== null ? { providerPaymentId: row.providerPaymentId } : {}),
    ...(row.reconciliationState !== null ? { reconciliationState: row.reconciliationState } : {}),
    ...(row.principalKey !== null ? { principalKey: row.principalKey } : {}),
    ...(row.requestHash !== null ? { requestHash: row.requestHash } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
