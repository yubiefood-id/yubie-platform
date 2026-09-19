import { eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { Database } from "../client.js";
import { conversationSyncCheckpoints } from "../schema/index.js";

export class PostgresReconcileCheckpointRepository {
  constructor(private readonly database: Database) {}

  async getCursor(provider: string) {
    const rows = await this.database.db
      .select()
      .from(conversationSyncCheckpoints)
      .where(eq(conversationSyncCheckpoints.provider, provider))
      .limit(1);
    return rows[0]?.cursorValue ?? null;
  }

  async saveCursor(provider: string, cursorValue: string, updatedAt: string) {
    const rows = await this.database.db
      .select()
      .from(conversationSyncCheckpoints)
      .where(eq(conversationSyncCheckpoints.provider, provider))
      .limit(1);

    if (rows.length > 0) {
      await this.database.db
        .update(conversationSyncCheckpoints)
        .set({ cursorValue, updatedAt })
        .where(eq(conversationSyncCheckpoints.provider, provider));
    } else {
      await this.database.db.insert(conversationSyncCheckpoints).values({
        id: `checkpoint-${provider}`,
        provider,
        cursorValue,
        updatedAt,
      });
    }
    return ok(undefined);
  }
}
