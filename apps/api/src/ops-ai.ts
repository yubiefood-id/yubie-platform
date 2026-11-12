import { randomUUID } from "node:crypto";
import { redactForLog } from "@yubie/domain";
import {
  OPS_AI_SYSTEM_PROMPT,
  createOpsAIProviderFromEnv,
  validateAIAnswerText,
  validateOpsInternalText,
  type OpsAIProvider,
  type OpsAIRequest,
} from "@yubie/assistant";
import { createZammadClient } from "@yubie/integrations";
import { opsAiAssistSchema } from "@yubie/validation";
import {
  createDatabase,
  contactHashFor,
  PostgresAIUsageRepository,
  PostgresAuditRepository,
  PostgresOpsAICallRepository,
  PostgresRuntimeConfigRepository,
  type Database,
} from "@yubie/persistence";
import { authorizeOps } from "./ops-assistant.js";

const DRAFT_NOTICE = "DRAFT operator-only — tidak ada yang terkirim ke pelanggan.";

// Stable operational facts embedded for runbook_qa grounding (kept tiny and
// versioned with the code; full SOP grounding is a documented follow-up).
const OPS_CONTEXT_FACTS = [
  "Kill switch seluruh otomasi pelanggan: POST /ops/assistant/emergency-off (butuh token ops).",
  "Status tri-mode: GET /ops/whatsapp/status. AI pelanggan default NONAKTIF (deterministik).",
  "AI operator: POST /ops/ai/assist dengan action summarize_thread | draft_reply | runbook_qa | draft_b2b_template.",
  "Prioritas internal (usulan, bukan janji SLA): P0 keamanan pangan 15 menit, P1 permintaan manusia 1 jam, P2 B2B hari kerja berikutnya.",
  "Jam operasional default: Senin-Jumat 09:00-17:00 WIB.",
  "Bot pelanggan adalah FSM deterministik (menu angka); AI tidak pernah membalas pelanggan pada konfigurasi default.",
].join("\n");

export async function handleOpsAI(request: Request, database: Database, provider?: OpsAIProvider): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/ops/ai")) return null;
  if (!authorizeOps(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const runtime = await new PostgresRuntimeConfigRepository(database).getSnapshot();

  if (request.method === "GET" && url.pathname === "/ops/ai/status") {
    const usage = await new PostgresAIUsageRepository(database).usageSummary();
    return Response.json({
      enabled: runtime.opsAIEnabled,
      policyMode: runtime.opsAIPolicy.mode,
      limits: runtime.opsAIPolicy.limits,
      provider: (provider ?? createOpsAIProviderFromEnv()).name,
      usage,
      customerAI: { enabled: runtime.aiAssistEnabled, note: "customer path stays deterministic" },
    });
  }

  if (request.method === "POST" && url.pathname === "/ops/ai/assist") {
    const parsed = opsAiAssistSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "invalid_ops_ai_request" }, { status: 400 });
    const body = parsed.data;
    if (!runtime.opsAIEnabled) return Response.json({ error: "ops_ai_disabled", hint: "set ops_ai_enabled + a live ops_ai_policy via runtime config" }, { status: 503 });

    const ai = provider ?? createOpsAIProviderFromEnv();
    if (ai.name === "throwing") return Response.json({ error: "ops_ai_provider_not_configured", hint: "set OPS_AI_PROVIDER=zai + ZAI_API_KEY in the service environment" }, { status: 503 });

    // Build the grounded context per action. Zammad reads go through the
    // existing least-privilege client; failures surface as 502, never silent.
    let userMessage = "";
    let resourceType = "question";
    let resourceId = "runbook";
    let customerBound = false;
    try {
      if (body.action === "summarize_thread" || body.action === "draft_reply") {
        resourceType = "thread";
        resourceId = body.threadId;
        const client = createZammadClient();
        const articles = await client.getTicketArticles(body.threadId);
        const recent = articles
          .filter((a) => !a.internal)
          .slice(-12)
          .map((a) => `${a.sender === "Customer" ? "Pelanggan" : "Agen"}: ${a.body.slice(0, 500)}`)
          .join("\n");
        if (!recent) return Response.json({ error: "thread_not_found_or_empty" }, { status: 404 });
        userMessage =
          body.action === "summarize_thread"
            ? `RIWAYAT TICKET:\n${recent}\n\nTugas: ringkas masalah pelanggan, tilik urgensi (P0 keamanan pangan? P1 minta manusia? P2/P3 rutin), dan usulkan draf jawaban singkat.`
            : `RIWAYAT TICKET:\n${recent}\n\nFAKTA DISETUJUI: lihat konteks produk resmi di bawah.\n${OPS_CONTEXT_FACTS}\n\nTugas: tulis DRAF balasan untuk pelanggan${body.instruction ? ` dengan instruksi operator: ${body.instruction}` : ""}. Ramah, Bahasa Indonesia, tanpa klaim harga/kesehatan/sertifikasi.`;
        customerBound = body.action === "draft_reply";
      } else if (body.action === "runbook_qa") {
        userMessage = `FAKTA OPERASIONAL:\n${OPS_CONTEXT_FACTS}\n\nPERTANYAAN OPERATOR:\n${body.question}`;
      } else {
        resourceType = "b2b_template";
        resourceId = "draft";
        customerBound = true;
        userMessage = `FAKTA OPERASIONAL:\n${OPS_CONTEXT_FACTS}\n\nKONTEKS B2B DARI OPERATOR:\n${body.context}\n\nTugas: tulis draf pesan template WhatsApp B2B (singkat, sopan, tanpa harga/MOQ pasti — itu butuh konfirmasi tim).`;
      }
    } catch {
      return Response.json({ error: "thread_source_unavailable" }, { status: 502 });
    }

    const policy = runtime.opsAIPolicy;
    const usage = new PostgresAIUsageRepository(database);
    const request_: OpsAIRequest = {
      systemPrompt: OPS_AI_SYSTEM_PROMPT,
      userMessage: userMessage.slice(0, policy.limits.maxInputTokens * 3),
      maxOutputTokens: policy.limits.maxOutputTokens,
      timeoutMs: policy.limits.timeoutMs,
    };
    const requestId = `opsai-${randomUUID()}`;
    const contactHash = contactHashFor("ops", body.operator);
    const reservation = await usage.reserve({
      requestId,
      contactHash,
      providerThreadId: "ops",
      model: ai.name,
      priceVersion: policy.limits.priceVersion,
      estimatedInputTokens: Math.ceil((request_.systemPrompt.length + request_.userMessage.length) / 4),
      limits: policy.limits,
      at: new Date(),
    });
    if (!reservation.ok || !reservation.reserved) {
      const reason = reservation.ok && !reservation.reserved ? reservation.reason : "policy_incomplete";
      return Response.json({ error: `ops_ai_denied_${reason}` }, { status: 429 });
    }

    let generation: Awaited<ReturnType<OpsAIProvider["generate"]>>;
    try {
      generation = await ai.generate(request_);
    } catch (error) {
      await usage.fail(requestId, `provider_threw:${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`, new Date());
      return Response.json({ error: "ops_ai_provider_unavailable" }, { status: 502 });
    }
    if (!generation.ok) {
      await usage.fail(requestId, `provider_${generation.code}`, new Date());
      return Response.json({ error: `ops_ai_provider_${generation.code}` }, { status: generation.code === "TIMEOUT" ? 504 : 502 });
    }

    // Customer-bound drafts pass the SAME hard claim validator as the customer
    // pipeline; internal answers use the softer operator rules.
    const validation = customerBound ? validateAIAnswerText(generation.text, policy.limits.maxOutputTokens) : validateOpsInternalText(generation.text);
    if (!validation.valid) {
      await usage.fail(requestId, `validation_${validation.reason}`, new Date());
      return Response.json({ error: "ops_ai_output_rejected", reason: validation.reason }, { status: 422 });
    }
    await usage.complete({
      requestId,
      actualInputTokens: generation.usage.inputTokens,
      actualOutputTokens: generation.usage.outputTokens,
      priceMicrousdPerToken: policy.limits.priceMicrousdPerToken,
      at: new Date(),
    });

    const now = new Date().toISOString();
    await new PostgresOpsAICallRepository(database).record({
      requestId,
      operator: body.operator,
      action: body.action,
      resourceType,
      resourceId,
      model: ai.name,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
      responseRedacted: redactForLog(generation.text),
      at: now,
    });
    await new PostgresAuditRepository(database).append({
      actor: `operator:${body.operator}`,
      action: `ops_ai.${body.action}`,
      resourceType,
      resourceId,
      occurredAt: now,
    });

    return Response.json({
      action: body.action,
      draft: generation.text,
      notice: DRAFT_NOTICE,
      usage: { inputTokens: generation.usage.inputTokens, outputTokens: generation.usage.outputTokens, model: ai.name },
    });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

/** Optional helper for scripts/tests that run against DATABASE_URL directly. */
export function createOpsAIDatabase(): Database {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  return createDatabase(databaseUrl);
}
