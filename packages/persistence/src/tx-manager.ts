import type { TransactionManager, TransactionalRepositories } from "@yubie/application";
import type { Database } from "./client.js";
import { PostgresAuditRepository } from "./repositories/audit-repository.js";
import { PostgresGrowthRepository } from "./repositories/growth-repository.js";
import { PostgresIdempotencyRepository } from "./repositories/idempotency-repository.js";
import { PostgresInventoryRepository } from "./repositories/inventory-repository.js";
import { PostgresOrderRepository, PostgresPaymentEventRepository, PostgresPaymentRepository } from "./repositories/order-repository.js";
import { PostgresOutboxRepository } from "./repositories/outbox-repository.js";
import { PostgresPaymentWebhookInboxRepository } from "./repositories/payment-webhook-inbox-repository.js";

/**
 * PostgreSQL implementation of the application transaction boundary. All work
 * runs inside one drizzle transaction: business state, audit and outbox commit
 * together or roll back together (AGENTS.md §5). Drizzle's transaction handle
 * exposes the same query-builder API the repositories use; the cast below is
 * the single, persistence-internal seam that binds repositories to the
 * transaction — application and domain code never see drizzle types.
 */
export class PostgresTransactionManager implements TransactionManager {
  constructor(private readonly database: Database) {}

  run<T>(operation: string, work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.database.db.transaction(async (tx) => {
      const txDatabase = { db: tx, client: this.database.client } as unknown as Database;
      return work({
        orders: new PostgresOrderRepository(txDatabase),
        payments: new PostgresPaymentRepository(txDatabase),
        paymentEvents: new PostgresPaymentEventRepository(txDatabase),
        audit: new PostgresAuditRepository(txDatabase),
        outbox: new PostgresOutboxRepository(txDatabase),
        idempotency: new PostgresIdempotencyRepository(txDatabase),
        inbox: new PostgresPaymentWebhookInboxRepository(txDatabase),
        inventory: new PostgresInventoryRepository(txDatabase),
        growth: new PostgresGrowthRepository(txDatabase),
      });
    });
  }
}
