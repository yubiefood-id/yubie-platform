import { randomUUID } from "node:crypto";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { WebhookInboxAppendOutcome, WebhookInboxRecordInput, WebhookInboxRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { webhookInbox } from "../schema/index.js";

/**
 * Durable inbox for payment-provider webhook deliveries, sharing the generic
 * webhook_inbox table (provider = "xendit_payment_session"). A row is written
 * with status "processed" inside the SAME transaction as the payment/order
 * transition: a crash before COMMIT leaves no inbox row, so the provider's
 * redelivery reprocesses cleanly; a redelivery after COMMIT hits the unique
 * (provider, delivery_id) index and reports duplicate.
 */
export class PostgresPaymentWebhookInboxRepository implements WebhookInboxRepository {
  constructor(private readonly database: Database) {}

  async recordProcessed(input: WebhookInboxRecordInput): Promise<UseCaseResult<WebhookInboxAppendOutcome>> {
    const inserted = await this.database.db
      .insert(webhookInbox)
      .values({
        id: `win_${randomUUID()}`,
        provider: input.provider,
        deliveryId: input.deliveryId,
        eventType: input.eventType,
        payloadHash: input.payloadHash,
        status: "processed",
        receivedAt: input.receivedAt,
        processedAt: input.receivedAt,
        attemptCount: 1,
      })
      .onConflictDoNothing()
      .returning({ id: webhookInbox.id });
    return ok<WebhookInboxAppendOutcome>(inserted.length > 0 ? "inserted" : "duplicate");
  }
}
