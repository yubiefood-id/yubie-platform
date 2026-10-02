import { ok } from "@yubie/domain";
import type { GrowthRepository } from "../ports.js";

/** Test/local growth storage (mirrors the Postgres uniques). */
export class InMemoryGrowthRepository implements GrowthRepository {
  readonly newsletter = new Map<string, { email: string; name: string | null; status: string }>();
  readonly waitlist = new Map<string, { email: string; productId: string; status: string }>();
  readonly b2bLeads: Array<{ id: string; email: string; business: string; status: string }> = [];
  readonly consentLedger: Array<{ subjectKey: string; purpose: string; action: string; consentVersion: string }> = [];

  async recordNewsletterConsent(submission: { email: string; name: string | null }) {
    const existing = this.newsletter.get(submission.email);
    if (existing) return ok({ outcome: "already_subscribed" as const });
    this.newsletter.set(submission.email, { email: submission.email, name: submission.name, status: "pending" });
    return ok({ outcome: "subscribed" as const });
  }

  async recordWaitlistEntry(submission: { email: string; productId: string }) {
    const key = `${submission.email}:${submission.productId}`;
    if (this.waitlist.has(key)) return ok({ outcome: "already_waiting" as const });
    this.waitlist.set(key, { email: submission.email, productId: submission.productId, status: "waiting" });
    return ok({ outcome: "joined" as const });
  }

  async recordB2bLead(submission: { id: string; email: string; business: string }) {
    this.b2bLeads.push({ id: submission.id, email: submission.email, business: submission.business, status: "new" });
    return ok({ outcome: "created" as const });
  }

  async appendConsent(entry: { subjectKey: string; purpose: string; action: string; consentVersion: string }) {
    this.consentLedger.push({ subjectKey: entry.subjectKey, purpose: entry.purpose, action: entry.action, consentVersion: entry.consentVersion });
    return ok(null);
  }
}
