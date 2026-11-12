import { ok, type UseCaseResult } from "@yubie/domain";
import type { B2bLeadRecord, GrowthRepository } from "../ports.js";

/** Test/local growth storage (mirrors the Postgres uniques). */
export class InMemoryGrowthRepository implements GrowthRepository {
  readonly newsletter = new Map<string, { email: string; name: string | null; status: string }>();
  readonly waitlist = new Map<string, { phone: string; productId: string; status: string }>();
  readonly b2bLeads: B2bLeadRecord[] = [];
  readonly consentLedger: Array<{ subjectType: string; subjectKey: string; purpose: string; action: string; consentVersion: string }> = [];

  async recordNewsletterConsent(submission: { email: string; name: string | null }) {
    const existing = this.newsletter.get(submission.email);
    if (existing) return ok({ outcome: "already_subscribed" as const });
    this.newsletter.set(submission.email, { email: submission.email, name: submission.name, status: "pending" });
    return ok({ outcome: "subscribed" as const });
  }

  async recordWaitlistEntry(submission: { phone: string; productId: string }) {
    const key = `${submission.phone}:${submission.productId}`;
    if (this.waitlist.has(key)) return ok({ outcome: "already_waiting" as const });
    this.waitlist.set(key, { phone: submission.phone, productId: submission.productId, status: "waiting" });
    return ok({ outcome: "joined" as const });
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
    this.b2bLeads.push({
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
    return ok({ outcome: "created" as const });
  }

  async appendConsent(entry: { subjectType: string; subjectKey: string; purpose: string; action: string; consentVersion: string }) {
    this.consentLedger.push({ subjectType: entry.subjectType, subjectKey: entry.subjectKey, purpose: entry.purpose, action: entry.action, consentVersion: entry.consentVersion });
    return ok(null);
  }

  async getB2bLeadById(id: string): Promise<UseCaseResult<B2bLeadRecord | null>> {
    return ok(this.b2bLeads.find((lead) => lead.id === id) ?? null);
  }

  async countRecentB2bLeads(since: string, email?: string): Promise<number> {
    const from = Date.parse(since);
    const target = email?.toLowerCase();
    return this.b2bLeads.filter((lead) => Date.parse(lead.createdAt) >= from && (!target || lead.email.toLowerCase() === target)).length;
  }
}
