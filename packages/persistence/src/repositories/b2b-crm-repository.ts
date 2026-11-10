import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { b2bAccounts, b2bContacts, b2bOpportunities, b2bTasks } from "../schema/index.js";

export interface B2BLeadProjectionInput {
  leadId: string;
  contactName: string | null;
  business: string;
  city: string | null;
  businessType: string | null;
  email: string | null;
  whatsapp: string | null;
  interest: string | null;
  intent: string | null;
  source: string | null;
  nextActionAt: Date;
}

/**
 * WA-04: canonical B2B CRM projection. Exactly-once per lead via the UNIQUE
 * lead_id on b2b_opportunities; accounts/contacts deduplicate on natural keys
 * so repeated leads from the same business converge on one account.
 * Classification fields + contact coordinates only — never the lead's
 * free-text need/message (privacy per GOAL_PLAN WA-04).
 */
export class PostgresB2bCrmRepository {
  constructor(private readonly database: Database) {}

  async projectLead(input: B2BLeadProjectionInput): Promise<{ opportunityId: string; inserted: boolean }> {
    return this.database.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const normalized = input.business.trim().toLowerCase().slice(0, 200);
      const accountId = `b2bacc_${randomUUID()}`;
      await tx.insert(b2bAccounts).values({
        id: accountId,
        name: input.business.trim().slice(0, 200),
        normalizedName: normalized,
        ...(input.city ? { city: input.city.slice(0, 120) } : {}),
        ...(input.businessType ? { businessType: input.businessType.slice(0, 64) } : {}),
        ...(input.source ? { source: input.source.slice(0, 64) } : {}),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: b2bAccounts.normalizedName,
        set: { updatedAt: now, ...(input.city ? { city: input.city.slice(0, 120) } : {}) },
      });
      const [account] = await tx.select({ id: b2bAccounts.id }).from(b2bAccounts).where(eq(b2bAccounts.normalizedName, normalized)).limit(1);

      if (input.email || input.whatsapp) {
        await tx.insert(b2bContacts).values({
          id: `b2bcon_${randomUUID()}`,
          accountId: account!.id,
          ...(input.contactName ? { name: input.contactName.slice(0, 200) } : {}),
          ...(input.email ? { email: input.email.slice(0, 320) } : {}),
          ...(input.whatsapp ? { whatsapp: input.whatsapp.slice(0, 32) } : {}),
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing();
      }

      const opportunityId = `b2bopp_${randomUUID()}`;
      const insertedOpportunity = await tx.insert(b2bOpportunities).values({
        id: opportunityId,
        accountId: account!.id,
        leadId: input.leadId,
        stage: "new",
        owner: "unassigned",
        ...(input.interest ? { interest: input.interest.slice(0, 120) } : {}),
        ...(input.intent ? { intent: input.intent.slice(0, 64) } : {}),
        ...(input.city ? { city: input.city.slice(0, 120) } : {}),
        ...(input.source ? { source: input.source.slice(0, 64) } : {}),
        nextActionAt: input.nextActionAt.toISOString(),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing({ target: b2bOpportunities.leadId }).returning({ id: b2bOpportunities.id });

      if (insertedOpportunity.length === 0) {
        const [existing] = await tx.select({ id: b2bOpportunities.id }).from(b2bOpportunities).where(eq(b2bOpportunities.leadId, input.leadId)).limit(1);
        return { opportunityId: existing!.id, inserted: false };
      }

      await tx.insert(b2bTasks).values({
        id: `b2btask_${randomUUID()}`,
        opportunityId,
        title: `Tindak lanjut B2B lead (${input.intent ?? "general"})`,
        dueAt: input.nextActionAt.toISOString(),
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      return { opportunityId, inserted: true };
    });
  }

  async summary(): Promise<{ opportunities: number; openTasks: number; unassignedNew: number; oldestUnassignedAgeSeconds: number }> {
    const [opportunities] = await this.database.db.select({ count: sql<number>`count(*)::int` }).from(b2bOpportunities);
    const [openTasks] = await this.database.db.select({ count: sql<number>`count(*)::int` }).from(b2bTasks).where(eq(b2bTasks.status, "open"));
    const [unassignedNew] = await this.database.db
      .select({
        count: sql<number>`count(*)::int`,
        oldestAgeSeconds: sql<number>`coalesce(max(extract(epoch from now() - ${b2bOpportunities.createdAt}))::int, 0)`,
      })
      .from(b2bOpportunities)
      .where(sql`${b2bOpportunities.owner} = 'unassigned' AND ${b2bOpportunities.stage} = 'new'`);
    return {
      opportunities: opportunities?.count ?? 0,
      openTasks: openTasks?.count ?? 0,
      unassignedNew: unassignedNew?.count ?? 0,
      oldestUnassignedAgeSeconds: unassignedNew?.oldestAgeSeconds ?? 0,
    };
  }
}
