import type { SupportConversationProvider, SupportThreadRef, ProviderSendResult } from "@yubie/application";
import { buildHandoffCommand } from "@yubie/integrations";
import {
  createAIAssistProviderFromEnv,
  estimateInputTokens,
  validateAIAnswerText,
  type AIAssistContextTurn,
  type AIAssistProvider,
  type AIAssistRequest,
} from "@yubie/assistant";
import { deriveYubiCapabilities, parseLaunchProfile } from "@yubie/config";
import { PRIORITY_NEXT_ACTION_MS, type SupportPriority } from "@yubie/domain";
import {
  assistantOutbox, withAssistantTransaction,
  PostgresAIUsageRepository, PostgresAssistantWorkRepository, PostgresAssistantOutboxRepository,
  PostgresConversationSessionRepository, PostgresKnowledgeRepository, PostgresPrioritySupportTaskRepository,
  PostgresRuntimeConfigRepository, contactHashFor, type Database,
} from "@yubie/persistence";
import { increment, setGauge } from "./metrics.js";
import { AI_QUOTA_EXHAUSTED_COPY, AI_UNAVAILABLE_COPY } from "./trimode-copy.js";

function threadRefFromRow(row: {provider:string;providerThreadId:string|null;conversationRef:string}): SupportThreadRef {
  return {provider:row.provider as SupportThreadRef["provider"],threadId:row.providerThreadId??row.conversationRef};
}
const RETRY_DELAYS=[30_000,120_000,600_000,1_800_000];

// WA-03: bounded AI answer pipeline. Runs at delivery time (never inside the
// conversation turn lock), after the shared reply prechecks: reserve atomically
// BEFORE any model call, single generation attempt, validate the output against
// the hard claim rules, reconcile usage exactly once, then send through the
// normal idempotent reply path. Denial/failure always resolves to a
// deterministic fallback reply — never silence, never a model retry.
async function runAIAnswerPipeline(args: {
  database: Database;
  support: SupportConversationProvider;
  aiAssist: AIAssistProvider;
  row: typeof assistantOutbox.$inferSelect;
  payload: Record<string,unknown>;
  ref: SupportThreadRef;
  runtime: import("@yubie/persistence").RuntimeConfigSnapshot;
  authorizeDispatch: () => Promise<boolean>;
}): Promise<{ kind: "fallback" } | { kind: "sent"; result: ProviderSendResult }> {
  const { database, support, aiAssist, row, payload, ref, runtime, authorizeDispatch } = args;
  const repo = new PostgresAssistantOutboxRepository(database);
  const now = new Date();
  const at = now.toISOString();
  const fallbackReply = async (copy: string, code: string) => {
    await withAssistantTransaction(database, async bound => {
      await new PostgresAssistantOutboxRepository(bound).enqueue({
        provider: row.provider,
        providerThreadId: row.providerThreadId ?? row.conversationRef,
        conversationRef: row.conversationRef,
        actionType: "reply",
        payloadFingerprint: `${row.payloadFingerprint}:fallback`,
        payloadJson: JSON.stringify({ content: copy, customerReceivedAt: payload.customerReceivedAt, requires: payload.requires }),
        createdAt: at,
      });
    });
    await repo.updateStatus(row.id, "cancelled", { lastError: code }, at);
    increment("trimode_ai_fallback_total");
    return { kind: "fallback" as const };
  };

  if (!runtime.aiAssistEnabled || runtime.aiPolicy.mode !== "live") {
    return fallbackReply(AI_UNAVAILABLE_COPY, "ai_policy_disabled");
  }
  const policy = runtime.aiPolicy;

  // Approved knowledge only: the prompt is grounded in vetted facts.
  const knowledge = new PostgresKnowledgeRepository(database);
  const facts: string[] = [];
  for (const category of ["story", "applications", "root_education"]) {
    const fact = await knowledge.getEffectivePublicKnowledge(category, "brand:yubie");
    const data = fact?.data;
    const text = typeof data === "string" ? data : data && typeof data === "object" && "summary" in data && typeof (data as { summary?: unknown }).summary === "string" ? (data as { summary: string }).summary : "";
    if (text) facts.push(text.slice(0, 1200));
  }
  const recent = await support.getRecentMessages(ref, { limit: policy.limits.contextTurns * 2 });
  let contextTurns: AIAssistContextTurn[] = recent
    .filter((m) => !m.internal && m.text.trim().length > 0)
    .slice(-policy.limits.contextTurns)
    .map((m) => ({ role: m.role === "customer" ? "customer" as const : "assistant" as const, text: m.text.slice(0, 400) }));

  const question = String(payload.question ?? "").slice(0, 2000);
  let approvedFacts = (facts.length ? facts.join("\n\n") : "Informasi resmi Yubie belum tersedia untuk pertanyaan ini.").slice(0, policy.limits.maxInputTokens * 2);
  let request: AIAssistRequest = {
    question,
    contextTurns,
    approvedFacts,
    maxInputTokens: policy.limits.maxInputTokens,
    maxOutputTokens: policy.limits.maxOutputTokens,
    timeoutMs: policy.limits.timeoutMs,
  };
  // Keep the estimated prompt inside the input bound: drop context first,
  // then trim facts. If the question alone still exceeds the cap, denial.
  while (estimateInputTokens(request) > policy.limits.maxInputTokens && request.contextTurns.length > 0) {
    contextTurns = contextTurns.slice(1);
    request = { ...request, contextTurns };
  }
  if (estimateInputTokens(request) > policy.limits.maxInputTokens) {
    approvedFacts = approvedFacts.slice(0, Math.max(200, policy.limits.maxInputTokens * 2 - question.length));
    request = { ...request, approvedFacts };
  }

  const usage = new PostgresAIUsageRepository(database);
  await usage.expireStale(now);
  const contactHash = contactHashFor(ref.provider, String(payload.contactId ?? ref.threadId));
  const reservation = await usage.reserve({
    requestId: row.payloadFingerprint,
    contactHash,
    providerThreadId: ref.threadId,
    model: aiAssist.name,
    priceVersion: policy.limits.priceVersion,
    estimatedInputTokens: estimateInputTokens(request),
    limits: policy.limits,
    at: now,
  });
  if (!reservation.ok || !reservation.reserved) {
    const reason = reservation.ok && !reservation.reserved ? reservation.reason : "policy_incomplete";
    increment(`trimode_ai_denied_${reason}_total`);
    if (reason === "policy_incomplete" || reason === "input_tokens_over_limit") {
      return fallbackReply(AI_UNAVAILABLE_COPY, `ai_${reason}`);
    }
    return fallbackReply(AI_QUOTA_EXHAUSTED_COPY, `ai_${reason}`);
  }

  let generation: Awaited<ReturnType<AIAssistProvider["generate"]>>;
  try {
    generation = await aiAssist.generate(request);
  } catch (error) {
    await usage.fail(row.payloadFingerprint, `provider_threw:${error instanceof Error ? error.message.slice(0, 80) : "unknown"}`, now);
    return fallbackReply(AI_UNAVAILABLE_COPY, "ai_provider_error");
  }
  if (!generation.ok) {
    await usage.fail(row.payloadFingerprint, `provider_${generation.code}`, now);
    return fallbackReply(AI_UNAVAILABLE_COPY, `ai_provider_${generation.code}`);
  }
  const validation = validateAIAnswerText(generation.text, policy.limits.maxOutputTokens);
  if (!validation.valid) {
    await usage.fail(row.payloadFingerprint, `validation_${validation.reason}`, now);
    return fallbackReply(AI_UNAVAILABLE_COPY, "ai_output_rejected");
  }
  await usage.complete({
    requestId: row.payloadFingerprint,
    actualInputTokens: generation.usage.inputTokens,
    actualOutputTokens: generation.usage.outputTokens,
    priceMicrousdPerToken: policy.limits.priceMicrousdPerToken,
    at: now,
  });
  increment("trimode_ai_answer_total");

  const result = await support.sendReply({
    threadRef: ref,
    content: generation.text.slice(0, 4096),
    idempotencyKey: row.payloadFingerprint,
    authorizeDispatch,
  });
  return { kind: "sent", result };
}

async function mediaFallback(database: Database,row: typeof assistantOutbox.$inferSelect,payload: Record<string,unknown>) {
  if(typeof payload.fallbackText!=="string")return;
  await withAssistantTransaction(database,async bound=>{
    const repo=new PostgresAssistantOutboxRepository(bound);
    await repo.updateStatus(row.id,"failed",{lastError:"media_rejected"},new Date().toISOString());
    await repo.enqueue({provider:row.provider,providerThreadId:row.providerThreadId??row.conversationRef,conversationRef:row.conversationRef,actionType:"reply",payloadFingerprint:row.payloadFingerprint+":fallback",payloadJson:JSON.stringify({content:payload.fallbackText,customerReceivedAt:payload.customerReceivedAt,requires:payload.requires}),createdAt:new Date().toISOString()});
  });
  increment("product_media_failed_total");
  console.log(JSON.stringify({event:"product_media_failed",correlationId:row.id,errorCode:"MEDIA_REJECTED"}));
}

export async function deliverSupportOutbox(database: Database,support: SupportConversationProvider,outboxId: string,alreadyClaimed=false,aiAssist?: AIAssistProvider) {
  const repo=new PostgresAssistantOutboxRepository(database);
  const rows=alreadyClaimed?[await repo.get(outboxId)]:await repo.claimPending(1,outboxId);
  const row=rows[0];if(!row || row.status!=="delivering")return;
  const now=new Date().toISOString();
  const ref=threadRefFromRow(row);
  const terminal=async(status:"failed"|"cancelled",code:string)=>repo.updateStatus(row.id,status,{lastError:code},now);
  let payload: Record<string,unknown>;
  try {payload=JSON.parse(row.payloadJson) as Record<string,unknown>;}catch{await terminal("failed","invalid_payload");return;}
  try {
    const runtime=await new PostgresRuntimeConfigRepository(database).getSnapshot();
    let result: ProviderSendResult;
    if(row.actionType==="handoff") {
      // Safety internal routing is explicitly allowed while customer automation is OFF.
      if((!runtime.assistantEnabled || runtime.mode==="off") && payload.intent!=="FOOD_SAFETY"){await terminal("cancelled","automation_off");return;}
      const command=buildHandoffCommand(ref,(payload.intent??"HUMAN_REQUEST") as import("@yubie/domain").AssistantIntent,typeof payload.handoffReason==="string"?payload.handoffReason:undefined,{...(payload.flowVersion==="deterministic-v2"?{flowVersion:"deterministic-v2" as const}:{}),...(typeof payload.productId==="string"?{productId:payload.productId}:{})});
      if(payload.summary && typeof payload.summary==="object")command.summary=payload.summary as Record<string,unknown>;
      command.idempotencyKey=row.payloadFingerprint;
      if(payload.intent!=="FOOD_SAFETY") {
        command.authorizeDispatch=async()=>{
          const fresh=await new PostgresRuntimeConfigRepository(database).getSnapshot();
          const session=await new PostgresConversationSessionRepository(database).getByProviderThreadId(ref.provider,ref.threadId);
          return fresh.assistantEnabled && fresh.mode!=="off" && !(session.ok && session.value && ["HUMAN_ACTIVE","RESOLVED","QUEUED"].includes(session.value.state));
        };
        if(!await command.authorizeDispatch() || (await support.getCurrentHumanState(ref)).humanActive){await terminal("cancelled","human_takeover");return;}
      }
      result=await support.handoff(command);
      if(result.ok) {
        await new PostgresAssistantWorkRepository(database).completeHandoff(row.id,ref.provider,ref.threadId,now);
        increment(payload.intent==="FOOD_SAFETY"?"food_safety_routed_total":"human_handoff_completed_total");
        // WA-02 G-E: human-first handoffs get a durable internal triage task
        // with a due time (proposed internal targets, not SLA promises).
        // Exactly-once per delivered action via source_outbox_id.
        const priority: SupportPriority | null = payload.intent==="FOOD_SAFETY" ? "P0_FOOD_SAFETY" : payload.intent==="HUMAN_REQUEST" ? "P1_EXPLICIT_HUMAN" : null;
        if(priority) {
          await new PostgresPrioritySupportTaskRepository(database).recordHandoff({
            provider: ref.provider,
            providerThreadId: ref.threadId,
            ticketId: ref.threadId,
            sourceOutboxId: row.id,
            priority,
            ...(command.groupId ? {groupId:String(command.groupId)} : {}),
            reason: typeof payload.handoffReason==="string"?payload.handoffReason:String(payload.intent??"HUMAN_REQUEST"),
            nextActionAt: new Date(Date.parse(now)+PRIORITY_NEXT_ACTION_MS[priority]).toISOString(),
            at: now,
          });
        }
        return;
      }
    } else {
      if(!runtime.assistantEnabled || runtime.mode!=="auto"){await terminal("cancelled","automation_not_auto");return;}
      const sessions=new PostgresConversationSessionRepository(database);
      const local=await sessions.getByProviderThreadId(ref.provider,ref.threadId);
      const state=local.ok?local.value?.state:undefined;
      if(state && ["HUMAN_ACTIVE","RESOLVED","QUEUED","HANDOFF_REQUESTED"].includes(state) && !(payload.handoffReceipt && ["QUEUED","HANDOFF_REQUESTED"].includes(state))){await terminal("cancelled","human_takeover");return;}
      const caps=deriveYubiCapabilities(parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE),runtime.websiteRelease,process.env.YUBIE_ENV??"development");
      if(Array.isArray(payload.requires) && payload.requires.some(k=>typeof k!=="string" || !caps[k as keyof typeof caps])){await terminal("cancelled","capability_revoked");return;}
      // This is the customer dispatch boundary: no customer article is posted before these fresh checks.
      const human=await support.getCurrentHumanState(ref);
      if(human.humanActive || (human.automationDisabled && !payload.handoffReceipt)){await terminal("cancelled","human_takeover");return;}
      if(ref.provider==="zammad") {
        const last=Date.parse(human.lastCustomerAt??String(payload.customerReceivedAt??""));
        if(!Number.isFinite(last) || last>Date.now()+60_000 || Date.now()-last>=24*60*60*1000 || human.serviceWindowOpen===false){await terminal("cancelled","service_window_closed");return;}
      }
      const authorizeDispatch=async()=>{
        const fresh=await new PostgresRuntimeConfigRepository(database).getSnapshot();
        const current=await sessions.getByProviderThreadId(ref.provider,ref.threadId);
        const currentState=current.ok?current.value?.state:undefined;
        if(!fresh.assistantEnabled || fresh.mode!=="auto" || (currentState && ["HUMAN_ACTIVE","RESOLVED","QUEUED","HANDOFF_REQUESTED"].includes(currentState) && !(payload.handoffReceipt && ["QUEUED","HANDOFF_REQUESTED"].includes(currentState))))return false;
        const latestCaps=deriveYubiCapabilities(parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE),fresh.websiteRelease,process.env.YUBIE_ENV??"development");
        return !Array.isArray(payload.requires) || !payload.requires.some(k=>!latestCaps[k as keyof typeof latestCaps]);
      };
      if(row.actionType==="product_media") {
        result=support.sendProductMedia?await support.sendProductMedia({threadRef:ref,productId:String(payload.productId),assetId:String(payload.assetId),caption:String(payload.caption),websiteUrl:String(payload.websiteUrl),idempotencyKey:row.payloadFingerprint,correlationId:row.id,authorizeDispatch}):{ok:false,code:"VALIDATION_ERROR"};
        if(!result.ok && result.code==="VALIDATION_ERROR"){await mediaFallback(database,row,payload);return;}
      } else if(row.actionType==="ai_answer" && typeof payload.question==="string" && payload.question.length>0) {
        const outcome=await runAIAnswerPipeline({database,support,aiAssist:aiAssist??createAIAssistProviderFromEnv(),row,payload,ref,runtime,authorizeDispatch});
        if(outcome.kind==="fallback")return;
        result=outcome.result;
      } else if(row.actionType==="reply" && typeof payload.content==="string" && payload.content.length>0 && payload.content.length<=4096) {
        result=await support.sendReply({threadRef:ref,content:payload.content,idempotencyKey:row.payloadFingerprint,authorizeDispatch,handoffReceipt:payload.handoffReceipt===true});
      } else {await terminal("failed","invalid_action");return;}
      if(result.ok){if(row.actionType==="product_media")increment("product_media_accepted_total");await repo.updateStatus(row.id,ref.provider==="fake"?"delivered":"accepted",{...(result.providerMessageId?{providerMessageId:result.providerMessageId}:{}),nextAttemptAt:new Date(Date.now()+30_000).toISOString()},now);return;}
    }
    if(!result.ok) {
      increment("support_provider_error_total");
      if(result.code==="TIMEOUT" || result.code==="AMBIGUOUS"){await repo.updateStatus(row.id,"ambiguous",{lastError:result.code,nextAttemptAt:new Date(Date.now()+30_000).toISOString()},now);return;}
      if(["UNAUTHORIZED","FORBIDDEN","NOT_FOUND","VALIDATION_ERROR"].includes(result.code) || row.attemptCount>=5){await terminal("failed",result.code);return;}
      await repo.updateStatus(row.id,"retry",{lastError:result.code,nextAttemptAt:new Date(Date.now()+RETRY_DELAYS[Math.min(row.attemptCount-1,3)]!).toISOString()},now);
    }
  } catch {
    // A transport exception after dispatch may have created an article. Never blindly resend.
    await repo.updateStatus(row.id,"ambiguous",{lastError:"PROVIDER_OUTCOME_UNKNOWN",nextAttemptAt:new Date(Date.now()+30_000).toISOString()},now);
    increment("support_provider_error_total");
  }
}

export async function reconcileOutbound(database: Database,support: SupportConversationProvider) {
  const repo=new PostgresAssistantOutboxRepository(database);
  const rows=await repo.reconciliationCandidates(support.provider);
  for(const row of rows) {
    if(row.actionType==="handoff") {
      const payload=JSON.parse(row.payloadJson) as Record<string,unknown>;
      // Safety routing contains only convergent group/priority/tag writes, no customer article.
      // Retry its desired state after uncertain acknowledgment; routine multi-step writes stay held.
      if(payload.intent==="FOOD_SAFETY" && row.attemptCount<5) {
        if(await repo.retrySafetyHandoff(row.id))await deliverSupportOutbox(database,support,row.id);
      } else if(row.attemptCount>=5 || Date.now()-Date.parse(row.createdAt)>24*60*60*1000)await repo.updateStatus(row.id,"failed",{lastError:"HANDOFF_RECONCILIATION_REQUIRED"},new Date().toISOString());
      else await repo.updateStatus(row.id,"ambiguous",{nextAttemptAt:new Date(Date.now()+300_000).toISOString()},new Date().toISOString());
      continue;
    }
    if(!support.getOutboundStatus)continue;
    try {
      const status=await support.getOutboundStatus(threadRefFromRow(row),row.payloadFingerprint);
      const now=new Date().toISOString();
      if(status.state==="failed") {
        if(row.actionType==="product_media")await mediaFallback(database,row,JSON.parse(row.payloadJson));
        else await repo.updateStatus(row.id,"failed",{lastError:"PROVIDER_DELIVERY_FAILED"},now);
      } else if(status.state==="delivered"){await repo.updateStatus(row.id,"delivered",{deliveredAt:now,...(status.providerMessageId?{providerMessageId:status.providerMessageId}:{})},now);if(row.actionType==="product_media")increment("product_media_delivered_total");}
      else if(Date.now()-Date.parse(row.createdAt)>24*60*60*1000)await repo.updateStatus(row.id,"failed",{lastError:"DELIVERY_UNRESOLVED"},now);
      else await repo.updateStatus(row.id,status.state==="unknown"?"ambiguous":status.state,{nextAttemptAt:new Date(Date.now()+30_000).toISOString(),...(status.providerMessageId?{providerMessageId:status.providerMessageId}:{})},now);
    }catch{increment("support_provider_error_total");}
  }
}

async function refreshOutboxGauges(database: Database) {
  const rows = await new PostgresAssistantOutboxRepository(database).counts();

  let pending = 0;
  let ambiguous = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "pending" || row.status === "retry" || row.status === "delivering") pending += row.count;
    if (row.status === "ambiguous") ambiguous += row.count;
    if (row.status === "failed") failed += row.count;
  }
  setGauge("assistant_outbox_pending", pending);
  setGauge("assistant_outbox_ambiguous", ambiguous);
  setGauge("assistant_outbox_failed", failed);
}

export async function processPendingOutbox(database: Database, support: SupportConversationProvider, aiAssist?: AIAssistProvider) {
  const outboxRepo = new PostgresAssistantOutboxRepository(database);
  await outboxRepo.recoverExpiredClaims();
  // Bounded-expiry housekeeping so a crashed generation never permanently
  // blocks the per-contact concurrency slot.
  await new PostgresAIUsageRepository(database).expireStale(new Date());
  await reconcileOutbound(database,support);
  for(let i=0;i<20;i++) {
    // A lease starts at dispatch, never while waiting behind a batch of network calls.
    const [row]=await outboxRepo.claimPending(1,undefined,support.provider);
    if(!row)break;
    await deliverSupportOutbox(database,support,row.id,true,aiAssist);
  }
  await refreshOutboxGauges(database);
}

export const deliverChatwootOutbox = deliverSupportOutbox;
