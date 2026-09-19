import { ok } from "@yubie/domain";
import type { AuditRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { auditEvents } from "../schema/index.js";

let auditCounter = 0;

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly database: Database) {}

  async append(event: {
    action: string;
    resourceType: string;
    resourceId: string;
    actor: string;
    occurredAt: string;
  }) {
    auditCounter += 1;
    await this.database.db.insert(auditEvents).values({
      id: `audit-${auditCounter}`,
      actor: event.actor,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      occurredAt: event.occurredAt,
    });
    return ok(undefined);
  }
}
