import { err, ok, type AppError } from "@yubie/domain";
import type { Clock, GrowthRepository, IdGenerator, TransactionManager } from "../ports.js";

/** Version stamped on every consent record; bump on policy change. */
export const GROWTH_CONSENT_VERSION = "2026-10";

export interface NewsletterSubmissionInput {
  email: string;
  name?: string | null;
  source: string;
}

export interface WaitlistSubmissionInput {
  email: string;
  productId: "shake" | "ppang" | "mie";
  source: string;
}

export interface B2bLeadSubmissionInput {
  name: string;
  business: string;
  type: string;
  city: string;
  email: string;
  whatsapp: string;
  need?: string | null;
  intent: "sample" | "bulk" | "product-development" | "general";
  interest: string;
  message?: string | null;
  source: string;
}

export interface GrowthDeps {
  tx: TransactionManager;
  clock: Clock;
  ids: IdGenerator;
}

function id(deps: GrowthDeps, prefix: string): string {
  return `${prefix}_${deps.ids.nextId()}`;
}

/** Newsletter double-opt-in start: durable row + marketing consent grant. */
export async function subscribeNewsletter(
  input: NewsletterSubmissionInput,
  deps: GrowthDeps,
): Promise<{ ok: true; value: { outcome: "subscribed" | "already_subscribed" } } | { ok: false; error: AppError }> {
  const now = deps.clock.now();
  return deps.tx.run("growth.newsletter", async (repos) => {
    const result = await repos.growth.recordNewsletterConsent({
      email: input.email,
      name: input.name ?? null,
      source: input.source,
      consentVersion: GROWTH_CONSENT_VERSION,
      consentedAt: now,
    });
    if (!result.ok) return result;
    if (result.value.outcome === "subscribed") {
      await repos.growth.appendConsent({
        id: id(deps, "csl"),
        subjectType: "email",
        subjectKey: input.email,
        purpose: "marketing_newsletter",
      action: "granted",
      consentVersion: GROWTH_CONSENT_VERSION,
        source: input.source,
        occurredAt: now,
      });
    }
    await repos.audit.append({ action: "newsletter.subscribed", resourceType: "newsletter_subscription", resourceId: input.email, actor: "web", occurredAt: now });
    return result;
  });
}

/**
 * Product waitlist join: purpose "product_waitlist" only — this is NOT
 * marketing consent and never feeds the newsletter list.
 */
export async function joinProductWaitlist(
  input: WaitlistSubmissionInput,
  deps: GrowthDeps,
): Promise<{ ok: true; value: { outcome: "joined" | "already_waiting" } } | { ok: false; error: AppError }> {
  const now = deps.clock.now();
  return deps.tx.run("growth.waitlist", async (repos) => {
    const result = await repos.growth.recordWaitlistEntry({
      email: input.email,
      productId: input.productId,
      source: input.source,
      consentVersion: GROWTH_CONSENT_VERSION,
      consentedAt: now,
    });
    if (!result.ok) return result;
    if (result.value.outcome === "joined") {
      await repos.growth.appendConsent({
        id: id(deps, "csl"),
        subjectType: "email",
        subjectKey: input.email,
        purpose: "product_waitlist",
      action: "granted",
      consentVersion: GROWTH_CONSENT_VERSION,
        source: input.source,
        occurredAt: now,
      });
    }
    await repos.audit.append({ action: "waitlist.joined", resourceType: "product_waitlist_entry", resourceId: `${input.email}:${input.productId}`, actor: "web", occurredAt: now });
    return result;
  });
}

/** B2B lead: durable row + own consent purpose + outbox event for CRM. */
export async function submitB2bLead(
  input: B2bLeadSubmissionInput,
  deps: GrowthDeps,
): Promise<{ ok: true; value: { outcome: "created" } } | { ok: false; error: AppError }> {
  const now = deps.clock.now();
  const leadId = id(deps, "b2b");
  return deps.tx.run("growth.b2b_lead", async (repos) => {
    const result = await repos.growth.recordB2bLead({
      id: leadId,
      name: input.name,
      business: input.business,
      type: input.type,
      city: input.city,
      email: input.email,
      whatsapp: input.whatsapp,
      need: input.need ?? null,
      intent: input.intent,
      interest: input.interest,
      message: input.message ?? null,
      source: input.source,
      consentVersion: GROWTH_CONSENT_VERSION,
      consentedAt: now,
    });
    if (!result.ok) return result;
    await repos.growth.appendConsent({
      id: id(deps, "csl"),
      subjectType: "email",
      subjectKey: input.email,
      purpose: "b2b_contact",
      action: "granted",
      consentVersion: GROWTH_CONSENT_VERSION,
      source: input.source,
      occurredAt: now,
    });
    await repos.outbox.enqueue({
      eventType: "growth.b2b_lead_created",
      aggregateType: "b2b_lead",
      aggregateId: leadId,
      dedupeKey: `b2b_lead:${leadId}`,
      // No free-text bodies in payloads: only classification fields travel.
      payloadJson: JSON.stringify({ leadId, business: input.business, intent: input.intent, city: input.city, type: input.type }),
      availableAt: now,
    });
    await repos.audit.append({ action: "b2b.lead_created", resourceType: "b2b_lead", resourceId: leadId, actor: "web", occurredAt: now });
    return result;
  });
}

export { ok, err };
