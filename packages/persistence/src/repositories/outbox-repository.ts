import { ok } from "@yubie/domain";
import type { OutboxRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { outboxEvents } from "../schema/index.js";

let outboxCounter = 0;

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private readonly database: Database) {}

  async enqueue(event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    dedupeKey: string;
    payloadJson: string;
    availableAt: string;
  }) {
    outboxCounter += 1;
    await this.database.db.insert(outboxEvents).values({
      id: `outbox-${outboxCounter}`,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payloadJson: event.payloadJson,
      dedupeKey: event.dedupeKey,
      status: "pending",
      availableAt: event.availableAt,
      attemptCount: 0,
    });
    return ok(undefined);
  }
}
