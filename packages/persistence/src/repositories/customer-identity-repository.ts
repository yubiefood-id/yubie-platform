import { and, or, desc, eq, lte, lt, isNull, sql } from "drizzle-orm";
import type { AuthIdentity, PhoneChallenge } from "@yubie/domain";
import type { CustomerIdentityRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { authIdentities, phoneVerifications, users, identityRateBuckets } from "../schema/index.js";

export class PostgresCustomerIdentityRepository implements CustomerIdentityRepository {
  constructor(private readonly database: Database) {}
  async lock(keys: string[]) {
    for (const key of [...new Set(keys)].sort()) await this.database.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
  }
  async findIdentity(provider: AuthIdentity["provider"], subject: string) {
    const [row] = await this.database.db.select().from(authIdentities).where(and(eq(authIdentities.provider, provider), eq(authIdentities.subject, subject))).limit(1); return row ?? null;
  }
  async findUserIdentity(userId: string, provider: AuthIdentity["provider"]) {
    const [row] = await this.database.db.select().from(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, provider))).limit(1); return row ?? null;
  }
  async saveIdentity(value: AuthIdentity) { await this.database.db.insert(authIdentities).values(value); }
  async assignPhone(userId: string, phone: string, verifiedAt: string) {
    await this.database.db.update(users).set({ phone, phoneVerifiedAt: verifiedAt, updatedAt: verifiedAt }).where(eq(users.id, userId));
  }
  async assignGoogle(userId: string, subject: string) {
    const rows = await this.database.db.update(users).set({ googleSub: subject }).where(and(eq(users.id, userId), or(isNull(users.googleSub), eq(users.googleSub, subject)))).returning({ id: users.id });
    if (rows.length !== 1) throw new Error("IDENTITY_CONFLICT");
  }
  async findChallenge(id: string) { const [row] = await this.database.db.select().from(phoneVerifications).where(eq(phoneVerifications.id, id)).limit(1); return row ?? null; }
  async findRequest(browserHash: string, requestKey: string) {
    const [row] = await this.database.db.select().from(phoneVerifications).where(and(eq(phoneVerifications.browserHash, browserHash), eq(phoneVerifications.requestKey, requestKey))).limit(1); return row ?? null;
  }
  async latestChallenge(phoneHash: string, browserHash: string) {
    const [row] = await this.database.db.select().from(phoneVerifications).where(or(eq(phoneVerifications.phoneHash, phoneHash), eq(phoneVerifications.browserHash, browserHash))).orderBy(desc(phoneVerifications.createdAt)).limit(1); return row ?? null;
  }
  async saveChallenge(value: PhoneChallenge) {
    await this.database.db.insert(phoneVerifications).values(value).onConflictDoUpdate({ target: phoneVerifications.id, set: value });
  }
  async invalidateChallenges(phoneHash: string, browserHash: string, now: string) {
    await this.database.db.update(phoneVerifications).set({ state: "expired", verifier: null, phoneCiphertext: null, deliveryCiphertext: null, updatedAt: now }).where(and(eq(phoneVerifications.state, "active"), or(eq(phoneVerifications.phoneHash, phoneHash), eq(phoneVerifications.browserHash, browserHash))));
  }
  async admit(key: string, limit: number, expiresAt: string): Promise<boolean> {
    const rows = await this.database.db.insert(identityRateBuckets).values({ key, count: 1, expiresAt }).onConflictDoUpdate({ target: identityRateBuckets.key, set: { count: sql`${identityRateBuckets.count}+1` }, setWhere: lt(identityRateBuckets.count, limit) }).returning({ key: identityRateBuckets.key }); return rows.length === 1;
  }
  async claimDelivery(now: string): Promise<PhoneChallenge | null> {
    const rows = await this.database.db.execute(sql`
      SELECT id FROM phone_verifications WHERE state='active' AND expires_at>${now} AND delivery_attempts<5 AND
      ((delivery_state='queued' AND next_attempt_at<=${now}) OR
       (delivery_state='sending' AND lease_until<=${now}) OR
       (delivery_state IN('ambiguous','accepted') AND next_attempt_at<=${now}))
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
    const id = rows[0]?.id;
    if (typeof id !== "string") return null;
    const [row] = await this.database.db.update(phoneVerifications).set({ deliveryState: "sending", deliveryAttempts: sql`${phoneVerifications.deliveryAttempts}+1`, leaseUntil: new Date(Date.parse(now) + 30_000).toISOString(), updatedAt: now }).where(eq(phoneVerifications.id, id)).returning();
    return row ?? null;
  }
  async purgeExpired(now: string): Promise<void> {
    await this.database.db.update(phoneVerifications).set({ state: "expired", verifier: null, phoneCiphertext: null, deliveryCiphertext: null, updatedAt: now }).where(and(eq(phoneVerifications.state, "active"), lte(phoneVerifications.expiresAt, now)));
    await this.database.db.delete(phoneVerifications).where(lt(phoneVerifications.createdAt, new Date(Date.parse(now) - 86400_000).toISOString()));
    await this.database.db.delete(identityRateBuckets).where(lte(identityRateBuckets.expiresAt, now));
  }
}
