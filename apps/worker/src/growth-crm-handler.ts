import { PRIORITY_NEXT_ACTION_MS } from "@yubie/domain";
import { PostgresB2bCrmRepository, PostgresGrowthOutbox, type Database } from "@yubie/persistence";
import { increment } from "./metrics.js";

interface B2BLeadRow {
  id: string;
  name: string | null;
  business: string;
  type: string | null;
  city: string | null;
  email: string | null;
  whatsapp: string | null;
  interest: string | null;
  intent: string | null;
  source: string | null;
}

/**
 * WA-04: consume growth.b2b_lead_created from the transactional outbox into
 * the canonical CRM projection. Replay-safe (UNIQUE lead_id), bounded retries
 * (terminal failed after 10), and a projection failure rethrows so the queue
 * retries the batch — a CRM outage never loses a lead (GOAL_PLAN D25/G-F).
 */
export async function processGrowthCrm(database: Database): Promise<void> {
  const outbox = new PostgresGrowthOutbox(database);
  const events = await outbox.claim(10);
  let failed = 0;
  for (const event of events) {
    try {
      const [row] = await database.client`SELECT payload_json FROM outbox_events WHERE id=${event.id}`;
      if (!row) throw new Error("outbox_row_missing");
      const payload = JSON.parse(row.payload_json) as { leadId?: string };
      if (!payload.leadId) throw new Error("missing_lead_id");
      const [lead] = await database.client`SELECT id,name,business,type,city,email,whatsapp,interest,intent,source FROM b2b_leads WHERE id=${payload.leadId}`;
      if (!lead) throw new Error("lead_not_found");
      const crm = new PostgresB2bCrmRepository(database);
      const projected = await crm.projectLead({
        leadId: (lead as B2BLeadRow).id,
        contactName: (lead as B2BLeadRow).name,
        business: (lead as B2BLeadRow).business,
        city: (lead as B2BLeadRow).city,
        businessType: (lead as B2BLeadRow).type,
        email: (lead as B2BLeadRow).email,
        whatsapp: (lead as B2BLeadRow).whatsapp,
        interest: (lead as B2BLeadRow).interest,
        intent: (lead as B2BLeadRow).intent,
        source: (lead as B2BLeadRow).source,
        // Internal triage target (proposed, not an SLA): P2 next business day.
        nextActionAt: new Date(Date.now() + PRIORITY_NEXT_ACTION_MS.P2_B2B),
      });
      await outbox.complete(event);
      increment(projected.inserted ? "growth_crm_projected_total" : "growth_crm_duplicate_skipped_total");
    } catch {
      await outbox.retry(event);
      increment("growth_crm_retry_total");
      failed += 1;
    }
  }
  if (failed > 0) throw new Error("GROWTH_CRM_RETRY_PENDING");
}
