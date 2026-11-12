import { randomUUID } from "node:crypto";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { B2bLeadRecord, GrowthRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { and, eq, gte, sql } from "drizzle-orm";
import { b2bLeads, consentLedger, newsletterSubscriptions, productWaitlistEntries } from "../schema/index.js";

/**
 * PostgreSQL growth + consent storage (migrations 0010 + 0022). Natural keys
 * (newsletter email; waitlist phone+product) make duplicate submissions
 * idempotent; the consent ledger is append-only.
 */
export class PostgresGrowthRepository implements GrowthRepository {
  constructor(private readonly database: Database) {}

  async recordNewsletterConsent(submission: { email: string; name: string | null; source: string; consentVersion: string; consentedAt: string }): Promise<UseCaseResult<{ outcome: "subscribed" | "already_subscribed" }>> {
    const inserted = await this.database.db
      .insert(newsletterSubscriptions)
      .values({
        id: `nws_${randomUUID()}`,
        email: submission.email,
        status: "pending",
        name: submission.name,
        source: submission.source,
        consentVersion: submission.consentVersion,
        consentedAt: submission.consentedAt,
        createdAt: submission.consentedAt,
        updatedAt: submission.consentedAt,
      })
      .onConflictDoNothing({ target: newsletterSubscriptions.email })
      .returning({ id: newsletterSubscriptions.id });
    return ok({ outcome: inserted.length > 0 ? "subscribed" : "already_subscribed" });
  }

  async recordWaitlistEntry(submission: { phone: string; productId: string; source: string; consentVersion: string; consentedAt: string }): Promise<UseCaseResult<{ outcome: "joined" | "already_waiting" }>> {
    const inserted = await this.database.db
      .insert(productWaitlistEntries)
      .values({
        id: `wtl_${randomUUID()}`,
        phone: submission.phone,
        productId: submission.productId,
        status: "waiting",
        source: submission.source,
        consentVersion: submission.consentVersion,
        consentedAt: submission.consentedAt,
        createdAt: submission.consentedAt,
        updatedAt: submission.consentedAt,
      })
      .onConflictDoNothing({ target: [productWaitlistEntries.phone, productWaitlistEntries.productId] })
      .returning({ id: productWaitlistEntries.id });
    return ok({ outcome: inserted.length > 0 ? "joined" : "already_waiting" });
  }

  async recordB2bLead(submission: {
    id: string;
    name: string;
    business: string;
    type: string;
    city: string;
    email: string;
    whatsapp: string;
    need: string | null;
    intent: string;
    interest: string;
    message: string | null;
    source: string;
    consentVersion: string;
    consentedAt: string;
  }): Promise<UseCaseResult<{ outcome: "created" }>> {
    await this.database.db.insert(b2bLeads).values({
      id: submission.id,
      name: submission.name,
      business: submission.business,
      type: submission.type,
      city: submission.city,
      email: submission.email,
      whatsapp: submission.whatsapp,
      need: submission.need,
      intent: submission.intent,
      interest: submission.interest,
      message: submission.message,
      status: "new",
      source: submission.source,
      consentVersion: submission.consentVersion,
      consentedAt: submission.consentedAt,
      createdAt: submission.consentedAt,
      updatedAt: submission.consentedAt,
    });
    return ok({ outcome: "created" });
  }

  async appendConsent(entry: { id: string; subjectType: string; subjectKey: string; purpose: string; action: string; consentVersion: string; source: string; occurredAt: string }): Promise<UseCaseResult<null>> {
    await this.database.db.insert(consentLedger).values({
      id: entry.id,
      subjectType: entry.subjectType,
      subjectKey: entry.subjectKey,
      purpose: entry.purpose,
      action: entry.action,
      consentVersion: entry.consentVersion,
      source: entry.source,
      occurredAt: entry.occurredAt,
    });
    return ok(null);
  }

  async getB2bLeadById(id: string): Promise<UseCaseResult<B2bLeadRecord | null>> {
    const rows = await this.database.db.select().from(b2bLeads).where(eq(b2bLeads.id, id)).limit(1);
    const row = rows[0];
    if (!row) return ok(null);
    return ok({
      id: row.id,
      name: row.name,
      business: row.business,
      type: row.type,
      city: row.city,
      email: row.email,
      whatsapp: row.whatsapp,
      need: row.need,
      intent: row.intent,
      interest: row.interest,
      message: row.message,
      status: row.status,
      source: row.source,
      consentVersion: row.consentVersion,
      consentedAt: row.consentedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /** Case-insensitive rolling-hour count; email omitted counts globally. */
  async countRecentB2bLeads(since: string, email?: string): Promise<number> {
    const condition = email
      ? and(gte(b2bLeads.createdAt, since), sql`lower(${b2bLeads.email}) = ${email.toLowerCase()}`)
      : gte(b2bLeads.createdAt, since);
    const rows = await this.database.db.select({ total: sql<number>`count(*)::int` }).from(b2bLeads).where(condition);
    return rows[0]?.total ?? 0;
  }
}
