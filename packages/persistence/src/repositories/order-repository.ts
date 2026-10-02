import { and, desc, eq } from "drizzle-orm";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { OrderLineRecord, OrderRecord, PaymentEventRecord, PaymentRecord } from "@yubie/domain";
import type { OrderRepository, PaymentEventAppendOutcome, PaymentEventRepository, PaymentRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { firstPartyOrders, orderPayments, paymentEvents } from "../schema/index.js";

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

  async listForUser(userId: string) {
    const rows = await this.database.db.select().from(firstPartyOrders).where(eq(firstPartyOrders.userId, userId)).orderBy(desc(firstPartyOrders.createdAt));
    return ok(rows.map(mapOrderRow));
  }

  async save(order: OrderRecord) {
    await this.database.db.insert(firstPartyOrders).values({
      id: order.id,
      checkoutRef: order.checkoutRef,
      status: order.status,
      userId: order.userId,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      deliveryJsonb: order.delivery,
      currency: order.currency,
      totalAmount: order.totalAmount,
      linesJsonb: order.lines,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }).onConflictDoUpdate({
      target: firstPartyOrders.id,
      set: {
        status: order.status,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        linesJsonb: order.lines,
        updatedAt: order.updatedAt,
      },
    });
    return ok(undefined);
  }
}

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly database: Database) {}

  async findById(id: string) {
    const rows = await this.database.db.select().from(orderPayments).where(eq(orderPayments.id, id)).limit(1);
    return ok(rows[0] ? mapPaymentRow(rows[0]) : null);
  }

  async findByProviderSession(provider: string, providerSessionId: string) {
    const rows = await this.database.db.select().from(orderPayments)
      .where(and(eq(orderPayments.provider, provider), eq(orderPayments.providerSessionId, providerSessionId))).limit(1);
    return ok(rows[0] ? mapPaymentRow(rows[0]) : null);
  }

  async findByOrderId(orderId: string) {
    const rows = await this.database.db.select().from(orderPayments).where(eq(orderPayments.orderId, orderId)).orderBy(desc(orderPayments.createdAt));
    return ok(rows.map(mapPaymentRow));
  }

  async save(payment: PaymentRecord) {
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
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    }).onConflictDoUpdate({
      target: orderPayments.id,
      set: {
        status: payment.status,
        redirectUrl: payment.redirectUrl,
        expiresAt: payment.expiresAt,
        updatedAt: payment.updatedAt,
      },
    });
    return ok(undefined);
  }
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
    status: row.status as OrderRecord["status"],
    userId: row.userId,
    customerEmail: row.customerEmail,
    customerName: row.customerName,
    delivery: (row.deliveryJsonb as OrderRecord["delivery"]) ?? null,
    currency: "IDR",
    totalAmount: row.totalAmount,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
