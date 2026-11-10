import { randomUUID, createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { b2bContacts, consentLedger, outboundDrafts, outboundSends, outboundTemplates } from "../schema/index.js";

export const OUTBOUND_FOLLOWUP_PURPOSE = "b2b_followup";

export interface OutboundDispatchClaim {
  draftId: string;
  sendId: string;
  attempt: number;
  toWhatsapp: string;
  templateName: string;
  templateVersion: string;
  templateLanguage: string;
  templateStatus: string;
  bodyText: string;
  purpose: string;
  contentHash: string;
  expiresAt: string | null;
  costCapMicrousd: number;
}

/**
 * WA-05: approved outbound template gateway state. Dispatch claiming is a
 * short row-lock transaction (FOR UPDATE SKIP LOCKED); every recheck that can
 * be expressed in SQL is, and the worker re-checks the rest (consent
 * precedence, caps, runtime switch) immediately before the transport call.
 */
export class PostgresOutboundTemplateRepository {
  constructor(private readonly database: Database) {}

  async registerTemplate(input: { name: string; version: string; language?: string; bodyText: string }) {
    const now = new Date().toISOString();
    const id = `otpl_${randomUUID()}`;
    await this.database.db.insert(outboundTemplates).values({
      id,
      name: input.name,
      version: input.version,
      language: input.language ?? "id",
      bodyText: input.bodyText,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    return id;
  }

  async approveTemplate(templateId: string, approvedBy: string, at: string) {
    const rows = await this.database.db.update(outboundTemplates).set({ status: "approved", approvedBy, approvedAt: at, updatedAt: at })
      .where(eq(outboundTemplates.id, templateId)).returning({ id: outboundTemplates.id });
    return rows.length === 1;
  }

  async createDraft(input: {
    templateId: string;
    purpose: string;
    contactId: string;
    variables: Record<string, string>;
    createdBy: string;
    costCapMicrousd?: number;
    expiresAt?: string;
  }) {
    const now = new Date().toISOString();
    const [template] = await this.database.db.select().from(outboundTemplates).where(eq(outboundTemplates.id, input.templateId)).limit(1);
    if (!template) throw new Error("template_not_found");
    const [contact] = await this.database.db.select().from(b2bContacts).where(eq(b2bContacts.id, input.contactId)).limit(1);
    if (!contact?.whatsapp) throw new Error("contact_whatsapp_missing");
    const contentHash = createHash("sha256").update(`${template.name}:${template.version}:${JSON.stringify(input.variables)}`).digest("hex");
    const id = `odrf_${randomUUID()}`;
    await this.database.db.insert(outboundDrafts).values({
      id,
      templateId: input.templateId,
      purpose: input.purpose,
      contactId: input.contactId,
      variablesJsonb: input.variables,
      contentHash,
      status: "draft",
      ...(input.costCapMicrousd ? { costCapMicrousd: input.costCapMicrousd } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    return { id, contentHash };
  }

  /** Approval binds the operator to the exact content hash; no implicit send. */
  async approveDraft(draftId: string, contentHash: string, approvedBy: string, expiresAt: string, at: string) {
    const [draft] = await this.database.db.select().from(outboundDrafts).where(eq(outboundDrafts.id, draftId)).limit(1);
    if (!draft || draft.status !== "draft") return { ok: false as const, reason: "draft_not_open" };
    if (draft.contentHash !== contentHash) return { ok: false as const, reason: "content_hash_mismatch" };
    await this.database.db.update(outboundDrafts).set({ status: "approved", approvedBy, approvedAt: at, expiresAt, updatedAt: at })
      .where(eq(outboundDrafts.id, draftId));
    return { ok: true as const };
  }

  /** Latest ledger action for the subject+purpose — revocation wins ties. */
  async effectiveConsent(subjectWhatsapp: string, purpose: string): Promise<"granted" | "revoked" | "none"> {
    const rows = await this.database.db
      .select({ action: consentLedger.action })
      .from(consentLedger)
      .where(sql`${consentLedger.subjectType}='whatsapp' AND ${consentLedger.subjectKey}=${subjectWhatsapp} AND ${consentLedger.purpose}=${purpose}`)
      .orderBy(sql`${consentLedger.occurredAt} DESC`)
      .limit(1);
    const action = rows[0]?.action;
    return action === "granted" ? "granted" : action === "revoked" ? "revoked" : "none";
  }

  async grantConsentForTest(subjectWhatsapp: string, purpose: string, action: "granted" | "revoked", at: string) {
    await this.database.db.insert(consentLedger).values({
      id: `csl_${randomUUID()}`,
      subjectType: "whatsapp",
      subjectKey: subjectWhatsapp,
      purpose,
      action,
      consentVersion: "test",
      source: "test",
      occurredAt: at,
    });
  }

  /** Claim due approved drafts for dispatch; creates/advances the send row. */
  async claimDispatches(limit: number, dailyContactCap: number): Promise<OutboundDispatchClaim[]> {
    // Raw SQL: FOR UPDATE must not touch the nullable side of the outer join,
    // so we lock only outbound_drafts via FOR UPDATE OF.
    const rows = await this.database.client.begin(async tx => tx`
      SELECT d.id AS draft_id, d.content_hash, d.expires_at, d.cost_cap_microusd,
             t.name AS template_name, t.version AS template_version, t.language AS template_language,
             t.status AS template_status, t.body_text, c.whatsapp AS contact_whatsapp
      FROM outbound_drafts d
      JOIN outbound_templates t ON t.id = d.template_id
      JOIN b2b_contacts c ON c.id = d.contact_id
      LEFT JOIN outbound_sends s ON s.draft_id = d.id
      WHERE d.status='approved'
        AND (d.expires_at IS NULL OR d.expires_at > now())
        AND t.status='approved'
        AND (s.id IS NULL OR (s.state='pending' AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= now())))
        AND (SELECT count(*) FROM outbound_sends s2 JOIN outbound_drafts d2 ON d2.id=s2.draft_id
             WHERE d2.contact_id=d.contact_id AND s2.created_at > now() - interval '24 hours'
               AND s2.state IN ('dispatched','delivered','ambiguous')) < ${dailyContactCap}
      ORDER BY d.created_at
      LIMIT ${limit}
      FOR UPDATE OF d SKIP LOCKED`);
    const claims: OutboundDispatchClaim[] = [];
    const now = new Date().toISOString();
    for (const row of rows) {
      const existing = await this.database.client`SELECT id, attempt_count FROM outbound_sends WHERE draft_id=${row.draft_id} LIMIT 1`;
      let sendId: string;
      let attempt: number;
      if (existing.length > 0) {
        sendId = existing[0]!.id;
        attempt = existing[0]!.attempt_count + 1;
        await this.database.client`UPDATE outbound_sends SET state='dispatched', attempt_count=${attempt}, last_error=NULL, updated_at=${now} WHERE id=${sendId}`;
      } else {
        sendId = `osnd_${randomUUID()}`;
        attempt = 1;
        await this.database.client`INSERT INTO outbound_sends (id,draft_id,state,attempt_count,created_at,updated_at) VALUES (${sendId},${row.draft_id},'dispatched',${attempt},${now},${now})`;
      }
      claims.push({
        draftId: row.draft_id,
        sendId,
        attempt,
        toWhatsapp: row.contact_whatsapp ?? "",
        templateName: row.template_name,
        templateVersion: row.template_version,
        templateLanguage: row.template_language,
        templateStatus: row.template_status,
        bodyText: row.body_text,
        purpose: "b2b_followup",
        contentHash: row.content_hash,
        expiresAt: row.expires_at,
        costCapMicrousd: Number(row.cost_cap_microusd ?? 0),
      });
    }
    return claims;
  }

  async updateSend(sendId: string, fields: { state?: string; providerMessageId?: string; costMicrousd?: number; lastError?: string; nextAttemptAt?: string }) {
    await this.database.db.update(outboundSends).set({ ...fields, updatedAt: new Date().toISOString() }).where(eq(outboundSends.id, sendId));
  }

  async cancelDraftAndSend(draftId: string, reason: string) {
    const now = new Date().toISOString();
    await this.database.db.update(outboundDrafts).set({ status: "cancelled", updatedAt: now }).where(eq(outboundDrafts.id, draftId));
    await this.database.db.update(outboundSends).set({ state: "cancelled", lastError: reason, updatedAt: now }).where(eq(outboundSends.draftId, draftId));
  }

  /** Sends awaiting provider receipt reconciliation. */
  async reconciliationCandidates(limit = 20) {
    return this.database.db.select({
      sendId: outboundSends.id,
      draftId: outboundSends.draftId,
      providerMessageId: outboundSends.providerMessageId,
      state: outboundSends.state,
      attemptCount: outboundSends.attemptCount,
      createdAt: outboundSends.createdAt,
    }).from(outboundSends)
      .where(sql`${outboundSends.state} IN ('dispatched','ambiguous') AND (${outboundSends.nextAttemptAt} IS NULL OR ${outboundSends.nextAttemptAt} <= now())`)
      .orderBy(outboundSends.createdAt)
      .limit(limit);
  }

  async outboundSummary(): Promise<{ dispatched: number; delivered: number; failed: number; ambiguous: number; monthCostMicrousd: number }> {
    const byState = await this.database.db.select({ state: outboundSends.state, count: sql<number>`count(*)::int` }).from(outboundSends).groupBy(outboundSends.state);
    const [cost] = await this.database.db.select({ total: sql<number>`coalesce(sum(${outboundSends.costMicrousd}),0)::bigint` }).from(outboundSends)
      .where(sql`${outboundSends.createdAt} > date_trunc('month', now())`);
    const map = new Map(byState.map(r => [r.state, r.count]));
    return {
      dispatched: map.get("dispatched") ?? 0,
      delivered: map.get("delivered") ?? 0,
      failed: map.get("failed") ?? 0,
      ambiguous: map.get("ambiguous") ?? 0,
      monthCostMicrousd: Number(cost?.total ?? 0),
    };
  }
}
