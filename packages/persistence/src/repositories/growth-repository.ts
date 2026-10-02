import { randomUUID } from "node:crypto";
import { ok, type UseCaseResult } from "@yubie/domain";
import type { GrowthRepository } from "@yubie/application";
import type { Database } from "../client.js";
import { b2bLeads, consentLedger, newsletterSubscriptions, productWaitlistEntries } from "../schema/index.js";

/**
 * PostgreSQL growth + consent storage (migration 0010). Natural keys
 * (newsletter email; waitlist email+product) make duplicate submissions
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

  async recordWaitlistEntry(submission: { email: string; productId: string; source: string; consentVersion: string; consentedAt: string }): Promise<UseCaseResult<{ outcome: "joined" | "already_waiting" }>> {
    const inserted = await this.database.db
      .insert(productWaitlistEntries)
      .values({
        id: `wtl_${randomUUID()}`,
        email: submission.email,
        productId: submission.productId,
        status: "waiting",
        source: submission.source,
        consentVersion: submission.consentVersion,
        consentedAt: submission.consentedAt,
        createdAt: submission.consentedAt,
        updatedAt: submission.consentedAt,
      })
      .onConflictDoNothing({ target: [productWaitlistEntries.email, productWaitlistEntries.productId] })
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
}
