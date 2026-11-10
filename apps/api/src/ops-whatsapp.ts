import { parseBotEngineName } from "@yubie/config";
import { outboundApproveSchema, outboundDraftCreateSchema, whatsappAiPolicySchema, whatsappModeResetSchema } from "@yubie/validation";
import {
  withAssistantTransaction,
  PostgresAIUsageRepository,
  PostgresAssistantOutboxRepository,
  PostgresB2bCrmRepository,
  PostgresConversationModeRepository,
  PostgresGrowthOutbox,
  PostgresOutboundTemplateRepository,
  PostgresPrioritySupportTaskRepository,
  PostgresRuntimeConfigRepository,
  OUTBOUND_FOLLOWUP_PURPOSE,
  type Database,
} from "@yubie/persistence";
import { authorizeOps } from "./ops-assistant.js";

/**
 * WA-02 protected operator surface for the WhatsApp tri-mode rollout
 * (ARCHITECTURE_AND_CONTRACTS §6, reduced to what exists in code today):
 * a PII-free status view and an operator-safe per-conversation mode reset.
 * Zammad remains the authority for ticket ownership/assignment; nothing here
 * sends messages or enables automation.
 */
export async function handleOpsWhatsApp(request: Request, database: Database): Promise<Response | null> {
  if(!new URL(request.url).pathname.startsWith("/ops/whatsapp"))return null;
  if(!authorizeOps(request))return Response.json({error:"unauthorized"},{status:401});
  return withAssistantTransaction(database,bound=>handleOpsWhatsAppLocked(request,bound),"yubi:runtime-config");
}

async function handleOpsWhatsAppLocked(request: Request, database: Database): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/ops/whatsapp")) return null;
  if (!authorizeOps(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (request.method === "GET" && url.pathname === "/ops/whatsapp/status") {
    const config = await new PostgresRuntimeConfigRepository(database).getSnapshot();
    const outbox = new PostgresAssistantOutboxRepository(database);
    const counts = await outbox.counts();
    const queueLag = counts.filter(r=>["pending","retry","delivering"].includes(r.status)).reduce((n,r)=>n+r.count,0);
    const deadLetters = counts.filter(r=>["failed","ambiguous"].includes(r.status)).reduce((n,r)=>n+r.count,0);
    const modeRows = await new PostgresConversationModeRepository(database).modeCounts();
    const modes: Record<string, number> = { DETERMINISTIC: 0, AI_OPT_IN: 0 };
    for (const row of modeRows.ok ? modeRows.value : []) modes[row.mode] = (modes[row.mode] ?? 0) + row.count;
    const tasks = await new PostgresPrioritySupportTaskRepository(database).openSummary();
    const priority: Record<string, number> = {};
    for (const row of tasks.ok ? tasks.value.byPriority : []) priority[row.priority] = row.count;
    const aiUsage = await new PostgresAIUsageRepository(database).usageSummary();
    const crm = await new PostgresB2bCrmRepository(database).summary();
    const growthPending = await new PostgresGrowthOutbox(database).pendingSummary();
    const outbound = await new PostgresOutboundTemplateRepository(database).outboundSummary();

    let botEngine = "deterministic";
    try { botEngine = parseBotEngineName(process.env.BOT_ENGINE ?? ""); } catch { /* keep default; startup owns fail-closed */ }
    return Response.json({
      botEngine,
      supportProviderEnv: process.env.SUPPORT_PROVIDER ?? process.env.CHAT_PROVIDER ?? "fake",
      runtime: {
        mode: config.mode,
        assistantEnabled: config.assistantEnabled,
        flowVersion: config.flowVersion,
        aiAssistEnabled: config.aiAssistEnabled,
        aiPolicyMode: config.aiPolicy.mode,
      },
      conversationModes: modes,
      priorityTasks: {
        openByPriority: priority,
        unacknowledged: tasks.ok ? tasks.value.unacknowledged : 0,
        oldestUnacknowledgedAgeSeconds: tasks.ok ? tasks.value.oldestUnacknowledgedAgeSeconds : 0,
      },
      ai: aiUsage,
      crm: { ...crm, pendingLeadEvents: growthPending.count, oldestPendingLeadAgeSeconds: growthPending.oldestAgeSeconds },
      outboundWhatsapp: { ...outbound, enabled: config.outboundWhatsappEnabled },
      queue: { queueLag, deadLetters },
      releaseSha: process.env.RELEASE_SHA ?? "dev",
    });
  }

  if (request.method === "POST" && url.pathname === "/ops/whatsapp/outbound/draft") {
    const parsed = outboundDraftCreateSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"invalid_outbound_draft"},{status:400});
    const body = parsed.data;
    const repo = new PostgresOutboundTemplateRepository(database);
    try {
      const draft = await repo.createDraft({
        templateId: body.templateId,
        purpose: body.purpose,
        contactId: body.contactId,
        variables: body.variables,
        createdBy: body.createdBy,
        ...(body.costCapMicrousd !== undefined ? { costCapMicrousd: body.costCapMicrousd } : {}),
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      });
      return Response.json({ ok: true, draftId: draft.id, contentHash: draft.contentHash, requiresApproval: true, implicitSend: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      return Response.json({ error: message }, { status: message === "template_not_found" || message === "contact_whatsapp_missing" ? 404 : 400 });
    }
  }

  const approveMatch = url.pathname.match(/^\/ops\/whatsapp\/outbound\/([^/]+)\/approve$/);
  if (request.method === "POST" && approveMatch?.[1]) {
    const parsed = outboundApproveSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"invalid_outbound_approval"},{status:400});
    const body = parsed.data;
    const repo = new PostgresOutboundTemplateRepository(database);
    const at = new Date();
    const result = await repo.approveDraft(approveMatch[1], body.contentHash, body.changedBy, new Date(at.getTime() + body.expiresInHours * 3600_000).toISOString(), at.toISOString());
    if(!result.ok)return Response.json({error:result.reason},{status:409});
    return Response.json({ ok: true, draftId: approveMatch[1], expiresAt: new Date(at.getTime() + body.expiresInHours * 3600_000).toISOString(), implicitSend: false, gatewayEnabled: false });
  }

  if (request.method === "POST" && url.pathname === "/ops/whatsapp/ai-policy") {
    const parsed = whatsappAiPolicySchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"invalid_ai_policy"},{status:400});
    const body = parsed.data;
    const now = new Date().toISOString();
    const runtime = new PostgresRuntimeConfigRepository(database);
    await runtime.setMany([
      { key: "ai_policy", value: { mode: body.mode, limits: body.limits, approvalRef: body.approvalRef, changedBy: body.changedBy } },
      { key: "ai_assist_enabled", value: body.mode === "live" },
    ], body.changedBy, now);
    const snapshot = await runtime.getSnapshot();
    return Response.json({ ok: true, mode: body.mode, effectiveAiAssistEnabled: snapshot.aiAssistEnabled, cannotEnableGlobalAuto: true });
  }

  if (request.method === "POST" && url.pathname === "/ops/whatsapp/conversation-mode/reset") {
    const parsed = whatsappModeResetSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"invalid_mode_reset"},{status:400});
    const body = parsed.data;
    const now = new Date().toISOString();
    const result = await new PostgresConversationModeRepository(database).transition(
      body.provider,
      body.threadId,
      "DETERMINISTIC",
      "operator_reset",
      now,
      { selectedBy: body.changedBy, detail: "operator mode reset" },
    );
    return Response.json({ ok: true, changed: result.ok ? result.value.changed : false });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
