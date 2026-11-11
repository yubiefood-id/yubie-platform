import type { B2bEmailRuntimeConfig } from "@yubie/config";
import {
  renderB2bEnquiryAcknowledgement,
  renderB2bEnquiryNotification,
  type AuditRepository,
  type EmailSender,
  type GrowthRepository,
  type OperationsOutbox,
} from "@yubie/application";
import { increment } from "./metrics.js";

/** Disjoint from the operations.outbox type list — separate claimer instances never compete. */
export const GROWTH_EMAIL_EVENT_TYPES = ["growth.b2b_enquiry_email_requested", "growth.b2b_enquiry_ack_requested"];

export interface GrowthEmailDeps {
  growth: GrowthRepository;
  audit: AuditRepository;
  email: EmailSender;
  config: B2bEmailRuntimeConfig;
}

/**
 * Enquiry email delivery over the shared outbox lease discipline:
 * growth.b2b_enquiry_email_requested → templated notification to the team
 * inbox (Reply-To = the lead's email); growth.b2b_enquiry_ack_requested →
 * templated receipt to the submitting business (Reply-To = the team inbox).
 * Provider I/O happens with no DB transaction open; a non-accepted send throws
 * so the event retries with backoff and fails closed after 10 attempts.
 * Logs and metrics carry the lead id and outcome only — never message bodies
 * or recipient content.
 */
export async function processGrowthEmail(store: OperationsOutbox, deps: GrowthEmailDeps): Promise<{ completed: number; failed: number }> {
  const events = await store.claim(3);
  let completed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      const lead = await deps.growth.getB2bLeadById(event.aggregateId);
      if (!lead.ok || !lead.value) {
        // A claimed event whose lead cannot be rehydrated is undeliverable by
        // any retry — release it instead of burning the attempt budget.
        await store.complete(event);
        console.error(JSON.stringify({ level: "warn", event: "growth.email.lead_missing", leadId: event.aggregateId, eventType: event.eventType }));
        completed++;
        continue;
      }
      if (event.eventType === "growth.b2b_enquiry_email_requested") {
        const message = renderB2bEnquiryNotification(lead.value);
        const result = await deps.email.send({ from: deps.config.from, to: deps.config.notifyTo, replyTo: lead.value.email, ...message });
        if (result.status !== "accepted") throw new Error(`GROWTH_EMAIL_SEND_${result.status.toUpperCase()}`);
        await deps.audit.append({ action: "b2b.enquiry_emailed", resourceType: "b2b_lead", resourceId: lead.value.id, actor: "worker", occurredAt: new Date().toISOString() });
        increment("growth_email_notified_total");
      } else if (event.eventType === "growth.b2b_enquiry_ack_requested") {
        if (!deps.config.ackEnabled) {
          await store.complete(event);
          completed++;
          continue;
        }
        const teamReplyTo = deps.config.notifyTo[0] ?? deps.config.from;
        const message = renderB2bEnquiryAcknowledgement(lead.value, { teamReplyTo });
        const result = await deps.email.send({ from: deps.config.from, to: [lead.value.email], replyTo: teamReplyTo, ...message });
        if (result.status !== "accepted") throw new Error(`GROWTH_EMAIL_ACK_${result.status.toUpperCase()}`);
        await deps.audit.append({ action: "b2b.enquiry_ack_sent", resourceType: "b2b_lead", resourceId: lead.value.id, actor: "worker", occurredAt: new Date().toISOString() });
        increment("growth_email_ack_total");
      } else {
        throw new Error("Unsupported growth email event");
      }
      await store.complete(event);
      completed++;
    } catch {
      await store.retry(event);
      failed++;
    }
  }
  return { completed, failed };
}
