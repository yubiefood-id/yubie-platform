import { randomUUID } from "node:crypto";
import { ok } from "@yubie/domain";
import type { AuditRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { auditEvents } from "../schema/index.js";

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly database: Database) {}

  async append(event: {
    action: string;
    resourceType: string;
    resourceId: string;
    actor: string;
    occurredAt: string;
  }) {
    // Opaque per-row ids: a process-local counter would collide across
    // restarts and break the PRIMARY KEY on insert.
    await this.database.db.insert(auditEvents).values({
      id: `audit_${randomUUID()}`,
      actor: event.actor,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      occurredAt: event.occurredAt,
    });
    return ok(undefined);
  }
}
