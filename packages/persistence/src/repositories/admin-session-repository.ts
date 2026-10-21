import { randomUUID } from "node:crypto";
import type { Database } from "../client.js";

/** Only a SHA-256 token hash is stored; no Google or Yubie cookie is persisted. */
export class PostgresAdminSessionRepository {
  constructor(private readonly database: Database) {}

  async isRevoked(tokenHash: string): Promise<boolean> {
    const rows = await this.database.client.begin("read only", async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      return sql`SELECT token_hash FROM admin_session_revocations WHERE token_hash = ${tokenHash} AND expires_at > NOW() LIMIT 1`;
    });
    return rows.length > 0;
  }

  async revoke(input: { tokenHash: string; expiresAt: string; actor: string }): Promise<void> {
    await this.database.client.begin(async (sql) => {
      await sql`SET LOCAL statement_timeout = '5s'`;
      const inserted = await sql`INSERT INTO admin_session_revocations (token_hash, expires_at)
        VALUES (${input.tokenHash}, ${input.expiresAt}) ON CONFLICT DO NOTHING RETURNING token_hash`;
      if (inserted.length) await sql`INSERT INTO audit_events (id, actor, action, resource_type, resource_id, occurred_at)
        VALUES (${`audit_${randomUUID()}`}, ${input.actor}, 'admin.logout', 'admin_session', ${input.tokenHash}, NOW())`;
    });
  }
}
