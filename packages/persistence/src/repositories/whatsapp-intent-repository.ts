import { and, eq } from "drizzle-orm";
import { ok, type WhatsAppIntent } from "@yubie/domain";
import type { WhatsAppIntentRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { whatsappIntents } from "../schema/index.js";

export class PostgresWhatsAppIntentRepository implements WhatsAppIntentRepository {
  constructor(private readonly database: Database) {}

  async findByKey(intentKey: string) {
    const rows = await this.database.db.select().from(whatsappIntents).where(eq(whatsappIntents.intentKey, intentKey)).limit(1);
    return ok(rows[0] ? mapRow(rows[0]) : null);
  }

  async findActiveByProduct(productId: string) {
    const rows = await this.database.db
      .select()
      .from(whatsappIntents)
      .where(and(eq(whatsappIntents.productId, productId), eq(whatsappIntents.status, "active")));
    return ok(rows.map(mapRow));
  }
}

function mapRow(row: typeof whatsappIntents.$inferSelect): WhatsAppIntent {
  return {
    intentKey: row.intentKey,
    destinationUrl: row.destinationUrl,
    audience: row.audience as "b2c" | "b2b",
    status: row.status,
    verifiedAt: row.verifiedAt,
    verifiedBy: row.verifiedBy,
    ...(row.productId ? { productId: row.productId } : {}),
    ...(row.rootId ? { rootId: row.rootId } : {}),
  };
}
