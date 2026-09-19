import { and, eq } from "drizzle-orm";
import { err, ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { idempotencyKeys } from "../schema/index.js";

export interface IdempotencyRecord {
  scope: string;
  principalKey: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
}

let idempotencyCounter = 0;

export class PostgresIdempotencyRepository {
  constructor(private readonly database: Database) {}

  async claim(record: IdempotencyRecord & { createdAt: string }) {
    const existing = await this.database.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.scope, record.scope),
          eq(idempotencyKeys.principalKey, record.principalKey),
          eq(idempotencyKeys.operation, record.operation),
          eq(idempotencyKeys.idempotencyKey, record.idempotencyKey),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0]!;
      if (row.requestHash === record.requestHash) {
        return ok({ status: "duplicate" as const });
      }
      return err({
        code: "conflict",
        message: "Idempotency key reused with different request",
        retryable: false,
        requestId: "idempotency",
      });
    }

    idempotencyCounter += 1;
    await this.database.db.insert(idempotencyKeys).values({
      id: `idem-${idempotencyCounter}`,
      scope: record.scope,
      principalKey: record.principalKey,
      operation: record.operation,
      idempotencyKey: record.idempotencyKey,
      requestHash: record.requestHash,
      status: "claimed",
      createdAt: record.createdAt,
    });
    return ok({ status: "claimed" as const });
  }
}
