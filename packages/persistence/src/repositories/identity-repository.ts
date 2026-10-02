import { desc, eq } from "drizzle-orm";
import { ok } from "@yubie/domain";
import type { AuthSession, PublicUser, UserAccount } from "@yubie/domain";
import type { SessionRepository, UserRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { authSessions, users } from "../schema/index.js";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly database: Database) {}

  async findByGoogleSub(googleSub: string) {
    const rows = await this.database.db.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
    return ok(rows[0] ? mapUserRow(rows[0]) : null);
  }

  async findById(id: string) {
    const rows = await this.database.db.select().from(users).where(eq(users.id, id)).limit(1);
    return ok(rows[0] ? mapUserRow(rows[0]) : null);
  }

  async save(user: UserAccount) {
    await this.database.db.insert(users).values({
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }).onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, name: user.name, picture: user.picture, updatedAt: user.updatedAt },
    });
    return ok(undefined);
  }
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly database: Database) {}

  async findByTokenHash(tokenHash: string) {
    const rows = await this.database.db.select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
    return ok(rows[0] ? mapSessionRow(rows[0]) : null);
  }

  async save(session: AuthSession) {
    await this.database.db.insert(authSessions).values({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    }).onConflictDoUpdate({
      target: authSessions.id,
      set: { revokedAt: session.revokedAt, expiresAt: session.expiresAt },
    });
    return ok(undefined);
  }

  async listForUser(userId: string) {
    const rows = await this.database.db.select().from(authSessions).where(eq(authSessions.userId, userId)).orderBy(desc(authSessions.createdAt));
    return ok(rows.map(mapSessionRow));
  }
}

function mapUserRow(row: typeof users.$inferSelect): UserAccount {
  return {
    id: row.id,
    googleSub: row.googleSub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSessionRow(row: typeof authSessions.$inferSelect): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

export type { PublicUser };
