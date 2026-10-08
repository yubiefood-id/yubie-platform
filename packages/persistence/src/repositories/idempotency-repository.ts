import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { err, ok, type UseCaseResult } from "@yubie/domain";
import type { IdempotencyClaim, IdempotencyClaimOutcome, IdempotencyRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { idempotencyKeys } from "../schema/index.js";

export interface IdempotencyRecord {
  scope: string;
  principalKey: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
}

function claimFilter(record: { scope: string; principalKey: string; operation: string; idempotencyKey: string }) {
  return and(
    eq(idempotencyKeys.scope, record.scope),
    eq(idempotencyKeys.principalKey, record.principalKey),
    eq(idempotencyKeys.operation, record.operation),
    eq(idempotencyKeys.idempotencyKey, record.idempotencyKey),
  );
}

/**
 * Claims (scope, principal, operation, key) rows in idempotency_keys. The
 * unique index makes concurrent claims race-safe without aborting the
 * surrounding transaction: onConflictDoNothing lets exactly one insert win;
 * everyone else reads the winner's request hash and reports duplicate (with
 * the stored first response) or conflict — never a silent re-execute.
 */
export class PostgresIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly database: Database) {}

  async claim(record: IdempotencyClaim): Promise<UseCaseResult<IdempotencyClaimOutcome>> {
    const inserted = await this.database.db
      .insert(idempotencyKeys)
      .values({
        id: `idem_${randomUUID()}`,
        scope: record.scope,
        principalKey: record.principalKey,
        operation: record.operation,
        idempotencyKey: record.idempotencyKey,
        requestHash: record.requestHash,
        status: "claimed",
        createdAt: record.createdAt,
      })
      .onConflictDoNothing({ target: [idempotencyKeys.scope, idempotencyKeys.principalKey, idempotencyKeys.operation, idempotencyKeys.idempotencyKey] })
      .returning({ id: idempotencyKeys.id });

    if (inserted.length > 0) return ok({ status: "claimed" });

    const existing = await this.database.db
      .select()
      .from(idempotencyKeys)
      .where(claimFilter(record))
      .limit(1);

    const row = existing[0];
    if (row && row.requestHash === record.requestHash) {
      return ok({ status: "duplicate", responseJson: row.responseJson });
    }
    return err({
      code: "conflict",
      message: "Idempotency key reused with different request",
      retryable: false,
      requestId: "idempotency",
    });
  }

  async attachResponse(
    record: Omit<IdempotencyClaim, "createdAt" | "requestHash">,
    responseJson: string,
  ): Promise<UseCaseResult<void>> {
    await this.database.db
      .update(idempotencyKeys)
      .set({ responseJson, status: "completed" })
      .where(claimFilter(record));
    return ok(undefined);
  }

  async releaseClaim(record: Omit<IdempotencyClaim, "createdAt" | "requestHash">): Promise<UseCaseResult<void>> {
    // PostgreSQL callers normally rely on transaction rollback; this exists
    // for rollback-parity with the in-memory manager and as an explicit
    // operator escape hatch. Only unclaimed/unresolved rows are removable.
    await this.database.db
      .delete(idempotencyKeys)
      .where(and(claimFilter(record), isNull(idempotencyKeys.responseJson)));
    return ok(undefined);
  }
}
