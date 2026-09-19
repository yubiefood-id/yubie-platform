import { ok } from "@yubie/domain";
import type { HealthProbe } from "@yubie/application";
import type { Database } from "./client.js";

export class PostgresHealthProbe implements HealthProbe {
  constructor(private readonly database: Database) {}

  async check() {
    try {
      await this.database.client`SELECT 1`;
      return ok({ ready: true, details: { database: "connected" } });
    } catch {
      return ok({ ready: false, details: { database: "unavailable" } });
    }
  }
}
