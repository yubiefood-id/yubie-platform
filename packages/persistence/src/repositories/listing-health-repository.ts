import { desc, eq } from "drizzle-orm";
import { ok, type ListingHealthCheck } from "@yubie/domain";
import type { ListingHealthRepository } from "@yubie/application";
import type { Database } from "../client.js";

// Stored in integration_health for M1 simplicity
import { integrationHealth } from "../schema/index.js";

let healthCounter = 0;

export class PostgresListingHealthRepository implements ListingHealthRepository {
  constructor(private readonly database: Database) {}

  async record(check: ListingHealthCheck) {
    healthCounter += 1;
    await this.database.db.insert(integrationHealth).values({
      id: `health-${healthCounter}`,
      integration: `listing:${check.listingKey}`,
      status: check.result,
      lastCheckedAt: check.checkedAt,
      details: JSON.stringify({ httpStatus: check.httpStatus, finalUrl: check.finalUrl }),
    });
    return ok(undefined);
  }

  async latestForListing(listingKey: string) {
    const rows = await this.database.db
      .select()
      .from(integrationHealth)
      .where(eq(integrationHealth.integration, `listing:${listingKey}`))
      .orderBy(desc(integrationHealth.lastCheckedAt))
      .limit(1);
    if (!rows[0]) return ok(null);
    const details = rows[0].details ? JSON.parse(rows[0].details) : {};
    return ok({
      listingKey,
      checkedAt: rows[0].lastCheckedAt,
      result: rows[0].status as ListingHealthCheck["result"],
      httpStatus: details.httpStatus,
      finalUrl: details.finalUrl,
    });
  }
}
