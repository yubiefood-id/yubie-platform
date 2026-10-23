import { createHash } from "node:crypto";
import type { SupportConversationProvider } from "@yubie/application";
import {
  createConversationEngineRouter,
  createInitialFlowState,
  createModelProviderFromEnv,
  DefaultResponseValidator,
  DeterministicRiskPolicy,
  FLOW_VERSION,
  KnowledgeToolRegistry,
  loadAssistantConfig,
  POLICY_VERSION,
  PROMPT_VERSION,
  resolveBotEngine,
  RuleBasedIntentClassifier,
  RuleOnlyStructuredClassifier,
  runAssistantPipeline,
  SYSTEM_PROMPT_V1,
  CLASSIFIER_VERSION,
  type HandoffDestination,
  matchesFoodSafety,
  isPriorityEscalation,
} from "@yubie/assistant";
import { resolveYubiProduct, BOT_REENTRY_COOLDOWN_MS, type ConversationState } from "@yubie/domain";
import { deriveYubiCapabilities, parseLaunchProfile } from "@yubie/config";
import {
  ChatwootConversationContextProvider,
  createChatwootClient,
  createSupportProvider,
  createZammadClient,
  parseAgentBotEvent,
  parseZammadTriggerPayload,
  resolveSupportProviderName,
  toNormalizedMessage,
  ZammadConversationContextProvider,
  buildHandoffCommand,
  isCustomerInboundArticle,
} from "@yubie/integrations";
import type { ConversationContextProvider } from "@yubie/integrations";
import {
  createDatabase,
  withAssistantTransaction,
  PostgresAssistantWorkRepository,
  PostgresAuditRepository,
  PostgresAssistantOutboxRepository,
  PostgresAssistantRunRepository,
  PostgresConversationFlowStateRepository,
  PostgresConversationSessionRepository,
  PostgresKnowledgeRepository,
  PostgresRuntimeConfigRepository,
  PostgresWebhookInboxRepository,
  webhookInbox,
  type Database,
} from "@yubie/persistence";
import { increment } from "./metrics.js";

export { createChatwootClient, createSupportProvider };

function fingerprint(conversationRef: string, actionType: string, payload: string) {
  return createHash("sha256").update(`${conversationRef}:${actionType}:${payload}`).digest("hex");
}

function createContextProvider(support: SupportConversationProvider): ConversationContextProvider {
  if (support.provider === "zammad") {
    return new ZammadConversationContextProvider(createZammadClient());
  }
  return new ChatwootConversationContextProvider(createChatwootClient());
}

async function resolveNormalizedMessage(
  database: Database,
  row: typeof webhookInbox.$inferSelect,
  support: SupportConversationProvider,
) {
  if (row.provider === "zammad") {
    const parsed = row.rawBody
      ? parseZammadTriggerPayload(JSON.parse(row.rawBody) as import("@yubie/integrations").ZammadTriggerPayload)
      : row.conversationRef && row.messageRef ? {ticketId:row.conversationRef,articleId:row.messageRef,customerId:row.contactRef??"0",groupId:row.inboxRef??"1"} : null;
    if (!parsed?.articleId) return null;

    const article = support.getArticle
      ? await support.getArticle({ provider: "zammad", threadId: parsed.ticketId }, parsed.articleId)
      : null;
    if (!article || !isCustomerInboundArticle({ sender: article.role === "customer" ? "Customer" : "Agent", internal: article.internal })) {
      return null;
    }

    return toNormalizedMessage({
      ticketId: parsed.ticketId,
      articleId: parsed.articleId,
      customerId: parsed.customerId ?? "0",
      groupId: parsed.groupId ?? "1",
      text: article.text,
      receivedAt: article.createdAt,
    });
  }

  let event: unknown;
  if (row.rawBody) {
    event = JSON.parse(row.rawBody) as unknown;
  } else if (row.messageRef && row.conversationRef) {
    const messages = await support.getRecentMessages(
      { provider: support.provider, threadId: row.conversationRef },
      { limit: 1 },
    );
    const msg = messages.find((m) => m.id === row.messageRef);
    if (!msg) return null;
    event = {
      event: "message_created",
      id: Number(row.messageRef),
      content: msg.text,
      message_type: "incoming",
      conversation: { id: Number(row.conversationRef), inbox_id: Number(row.inboxRef ?? 1) },
      sender: { id: Number(row.contactRef ?? 0) },
      created_at: msg.createdAt,
    };
  } else {
    return null;
  }

  return parseAgentBotEvent(event as import("@yubie/integrations").AgentBotWebhookEvent);
}

function mapHandoffDestination(destination?: HandoffDestination) {
  return destination;
}

async function processAssistantInboxLocked(
  database: Database,
  inboxId: string,
  support: SupportConversationProvider,
) {
  const inboxRepo = new PostgresWebhookInboxRepository(database);


  const row = await new PostgresAssistantWorkRepository(database).inboxById(inboxId);
  if (!row || row.status === "processed") return;
  await inboxRepo.markProcessing(inboxId);

  const observed=row.conversationRef?await support.getCurrentHumanState({provider:support.provider,threadId:row.conversationRef}):null;
  const eventRefs=row.provider==="zammad" && row.rawBody?parseZammadTriggerPayload(JSON.parse(row.rawBody)):null;
  const closedEvent=eventRefs?.stateId && support.resolveLifecycleState?await support.resolveLifecycleState(eventRefs.stateId)==="closed":false;
  if(row.conversationRef) {
    const sessions=new PostgresConversationSessionRepository(database);
    const current=await sessions.getByProviderThreadId(support.provider,row.conversationRef);
    const at=new Date().toISOString();
    if(closedEvent || observed?.lifecycle==="closed") {
      if(current.ok && !current.value)await sessions.upsert({provider:support.provider,providerThreadId:row.conversationRef,providerCustomerId:row.contactRef??"0",providerInboxOrChannelId:row.inboxRef??"0",inboxId:row.inboxRef??"0",state:"RESOLVED",lastActivityAt:at,createdAt:at,updatedAt:at});
      if(!current.ok || current.value?.state!=="RESOLVED")await sessions.updateState(support.provider,row.conversationRef,"RESOLVED",at);
    }else if(observed?.humanActive && current.ok && current.value && current.value.state!=="RESOLVED")await sessions.updateState(support.provider,row.conversationRef,"HUMAN_ACTIVE",at);
  }
  const message = await resolveNormalizedMessage(database, row, support);
  if (!message) {
    await inboxRepo.markProcessed(inboxId, new Date().toISOString());
    return;
  }

  const now = new Date().toISOString();
  const provider = support.provider;
  const sessions = new PostgresConversationSessionRepository(database);
  const flowStates = new PostgresConversationFlowStateRepository(database);
  const runs = new PostgresAssistantRunRepository(database);
  const outbox = new PostgresAssistantOutboxRepository(database);
  const knowledge = new PostgresKnowledgeRepository(database);
  const runtimeConfig = new PostgresRuntimeConfigRepository(database);
  const configSnapshot = await runtimeConfig.getSnapshot();

  const safety = matchesFoodSafety(message.text);
  const automationOff = !configSnapshot.assistantEnabled || configSnapshot.mode === "off";
  if (automationOff && !safety) {
    await inboxRepo.markProcessed(inboxId, now);
    return;
  }

  const threadRef = { provider, threadId: message.conversationId };
  const sessionResult = await sessions.getByProviderThreadId(provider, message.conversationId);
  const lastMessageId=sessionResult.ok ? sessionResult.value?.providerLastMessageId : null;
  const escalation=isPriorityEscalation(message.text);
  const outOfOrder=!escalation && provider==="zammad" && !!lastMessageId && /^\d+$/.test(lastMessageId) && BigInt(message.messageId)<=BigInt(lastMessageId);
  let conversationState: ConversationState =
    sessionResult.ok && sessionResult.value ? sessionResult.value.state : "BOT_ELIGIBLE";

  const humanState = await support.getCurrentHumanState(threadRef);
  if (humanState.humanActive && conversationState!=="RESOLVED") {
    conversationState = "HUMAN_ACTIVE";
  }
  if(conversationState==="RESOLVED" && sessionResult.ok && sessionResult.value?.botReleasedAt && sessionResult.value.resolvedAt && Date.now()-Date.parse(sessionResult.value.resolvedAt)>=BOT_REENTRY_COOLDOWN_MS && !humanState.humanActive && !humanState.automationDisabled && ["menu","start"].includes(message.text.trim().toLowerCase())) {
    conversationState="BOT_ELIGIBLE";
    await new PostgresAssistantWorkRepository(database).consumeRelease(provider,message.conversationId);
  }

  const savedSession = await sessions.upsert({
    provider,
    providerThreadId: message.conversationId,
    providerCustomerId: message.contactId,
    providerInboxOrChannelId: message.inboxId,
    ...(safety?{}:{providerLastMessageId: provider === "zammad" && lastMessageId && /^\d+$/.test(lastMessageId) && BigInt(lastMessageId)>BigInt(message.messageId) ? lastMessageId : message.messageId}),
    ...(provider === "chatwoot"
      ? { chatwootConversationId: message.conversationId, chatwootContactId: message.contactId }
      : {}),
    inboxId: message.inboxId,
    state: conversationState === "BOT_ELIGIBLE" ? "BOT_ACTIVE" : conversationState,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  });

  if (!savedSession.ok) throw new Error("session_write_failed");
  const sessionId = savedSession.value;
  const botEngine = resolveBotEngine();
  const started = Date.now();

  const existingFlow = await flowStates.get(provider, message.conversationId);
  const initialFlow = configSnapshot.flowVersion === "deterministic-v2" ? {nodeId:"HOME",flowVersion:"deterministic-v2",context:{},fallbackCount:0} : createInitialFlowState();
  const flowState = existingFlow.ok && existingFlow.value
    ? {
        nodeId: existingFlow.value.nodeId,
        flowVersion: existingFlow.value.flowVersion,
        context: existingFlow.value.context,
        fallbackCount: existingFlow.value.fallbackCount,
      }
    : initialFlow;

  const supportEvidence = configSnapshot.supportAcceptance as {approvalRef?: string; releaseSha?: string} | null;
  const capabilities = deriveYubiCapabilities(parseLaunchProfile(process.env.YUBIE_LAUNCH_PROFILE),configSnapshot.websiteRelease,process.env.YUBIE_ENV ?? "development",!!supportEvidence?.approvalRef && supportEvidence.releaseSha === process.env.RELEASE_SHA);
  const router = createConversationEngineRouter({
    knowledge,
    flowVersion: safety ? "deterministic-v2" : configSnapshot.flowVersion,
    capabilities,
    resolveProduct: resolveYubiProduct,
    legacyProcessor: async (input) => {
      const envConfig = loadAssistantConfig();
      const mode = configSnapshot.mode as "shadow" | "suggestion" | "auto";
      const autoReplyEnabled = envConfig.autoReplyEnabled && configSnapshot.assistantEnabled;
      const allowedGreenIntents = new Set(configSnapshot.allowedGreenIntents as import("@yubie/domain").AssistantIntent[]);
      const contextProvider = createContextProvider(support);
      const conversationContext = await contextProvider.fetchContext(message.conversationId);
      const structuredClassifier = new RuleOnlyStructuredClassifier();
      const tools = new KnowledgeToolRegistry({ knowledge });
      const outcome = await runAssistantPipeline(input.message, input.conversationState, {
        classifier: new RuleBasedIntentClassifier(),
        classifyStructured: (msg) => structuredClassifier.classify(msg),
        riskPolicy: new DeterministicRiskPolicy(),
        tools,
        model: createModelProviderFromEnv(),
        validator: new DefaultResponseValidator(),
        systemPrompt: SYSTEM_PROMPT_V1,
        autoReplyEnabled,
        allowedGreenIntents,
        mode,
        conversationContext: {
          recentTurns: conversationContext.recentTurns,
          customerLanguage: conversationContext.customerLanguage,
        },
      });
      const mapped: import("@yubie/assistant").ConversationEngineResult = {
        kind: outcome.kind,
        intent: outcome.intent,
        risk: outcome.risk,
        metrics: [],
      };
      if (outcome.text) mapped.text = outcome.text;
      if (outcome.handoffReason) mapped.handoffReason = outcome.handoffReason;
      return mapped;
    },
  });

  // A delayed navigation message cannot be interpreted against a newer menu.
  // Reset safely and ask for a new selection; safety never advances this watermark.
  if(outOfOrder)increment("assistant_out_of_order_reset_total");
  const engineResult = await router.process({
    message:outOfOrder?{...message,text:"menu"}:message,
    conversationState: automationOff ? "HUMAN_ACTIVE" : conversationState,
    flowState,
  });

  for (const metric of engineResult.metrics) {
    increment(metric);
  }

  if (engineResult.nextFlowState) {
    await flowStates.upsert({
      provider,
      providerThreadId: message.conversationId,
      flowVersion: engineResult.nextFlowState.flowVersion,
      nodeId: engineResult.nextFlowState.nodeId,
      context: engineResult.nextFlowState.context,
      fallbackCount: engineResult.nextFlowState.fallbackCount,
      lastTransitionAt: now,
      createdAt: existingFlow.ok && existingFlow.value ? existingFlow.value.createdAt : now,
      updatedAt: now,
    });
    await flowStates.appendEvent({
      provider,
      providerThreadId: message.conversationId,
      flowVersion: engineResult.flowVersion ?? FLOW_VERSION,
      fromNodeId: flowState.nodeId,
      toNodeId: engineResult.nextFlowState.nodeId,
      eventType: engineResult.kind,
      metricLabels: { intent: engineResult.intent, nodeId: engineResult.nodeId ?? "" },
      createdAt: now,
    });
  }

  const runId = runs.nextRunId();
  const runRecord: import("@yubie/persistence").AssistantRunRecord = {
    id: runId,
    sessionId,
    inboxEventId: inboxId,
    conversationRef: message.conversationId,
    messageRef: message.messageId,
    intent: engineResult.intent,
    risk: engineResult.risk,
    classifierVersion: botEngine === "deterministic" ? engineResult.flowVersion ?? FLOW_VERSION : CLASSIFIER_VERSION,
    policyVersion: POLICY_VERSION,
    knowledgeVersion: configSnapshot.knowledgeVersion,
    modelProvider: botEngine,
    modelName: botEngine === "deterministic" ? "none" : (process.env.VLLM_MODEL ?? "default"),
    promptVersion: botEngine === "deterministic" ? engineResult.flowVersion ?? FLOW_VERSION : PROMPT_VERSION,
    validatorOutcome: engineResult.kind,
    latencyMs: Date.now() - started,
    outcome: engineResult.kind,
    createdAt: now,
  };
  if (engineResult.kind === "handoff" && engineResult.handoffReason) {
    runRecord.handoffReason = engineResult.handoffReason;
  }
  await runs.insert(runRecord);

  let effectIndex=0;
  const enqueue=async(actionType: string,payload: Record<string,unknown>,dependsOnId?: string)=>{
    const encoded=JSON.stringify({...payload,customerReceivedAt:message.receivedAt,requires:Object.entries(capabilities).filter(([key,value])=>value && key!=="human_support_available").map(([key])=>key)});
    const result=await outbox.enqueue({runId,provider,providerThreadId:message.conversationId,conversationRef:message.conversationId,actionType,payloadFingerprint:fingerprint(`${provider}:${message.conversationId}`,`${inboxId}:${effectIndex++}`,""),payloadJson:encoded,createdAt:now,...(dependsOnId?{dependsOnId}:{})});
    // Audit the action identity, not customer/B2B text.
    await runs.insertAction({runId,actionType,detailsJson:JSON.stringify({outboxId:result.ok?result.value.id:null}),createdAt:now});
    if(!result.ok)throw new Error("outbox_write_failed");
    return result.value.id;
  };
  const canSend=configSnapshot.assistantEnabled && configSnapshot.mode === "auto";
  if (engineResult.kind === "handoff") {
    if(conversationState!=="HUMAN_ACTIVE" && conversationState!=="RESOLVED")await sessions.updateState(provider,message.conversationId,"HANDOFF_REQUESTED",now);
    const effect=engineResult.effects?.find(e=>e.kind==="CREATE_HANDOFF");
    const handoffId=await enqueue("handoff",{intent:engineResult.intent,handoffReason:engineResult.handoffReason,destination:engineResult.handoffDestination,flowVersion:engineResult.flowVersion,productId:engineResult.nextFlowState?.context.productId,...(effect?.kind==="CREATE_HANDOFF" && effect.summary?{summary:effect.summary}:{})});
    if(canSend && engineResult.text)await enqueue("reply",{content:engineResult.text,handoffReceipt:true},handoffId);
    // B2B context is no longer needed in navigation after its durable handoff.
    if(engineResult.handoffDestination==="SALES_PARTNERSHIP")await new PostgresAssistantWorkRepository(database).clearContext(provider,message.conversationId);
  } else if(engineResult.kind==="reply" && canSend) {
    let previous: string|undefined;
    if(engineResult.effects) {
      for(const effect of engineResult.effects) {
        if(effect.kind==="SEND_PRODUCT_MEDIA")previous=await enqueue("product_media",{...effect},previous);
        else if("text" in effect)previous=await enqueue("reply",{content:effect.text,messageId:effect.messageId},previous);
      }
    } else if(engineResult.text)await enqueue("reply",{content:engineResult.text});
    increment("deterministic_task_completed_total");
  }

  console.log(
    JSON.stringify({
      event: "assistant.turn",
      inboxId,
      runId,
      engine: botEngine,
      intent: engineResult.intent,
      risk: engineResult.risk,
      outcome: engineResult.kind,
      nodeId: engineResult.nodeId,
      latencyMs: Date.now() - started,
      provider,
    }),
  );

  await inboxRepo.markProcessed(inboxId, now);
}

async function requestInboxRecovery(database: Database,row: typeof webhookInbox.$inferSelect,provider: string) {
  const thread=row.conversationRef??row.id,at=new Date().toISOString();
  const sessions=new PostgresConversationSessionRepository(database);
  const session=await sessions.getByProviderThreadId(provider,thread);
  if(session.ok && session.value) {
    if(!["HUMAN_ACTIVE","RESOLVED","QUEUED"].includes(session.value.state))await sessions.updateState(provider,thread,"HANDOFF_REQUESTED",at);
  }else await sessions.upsert({provider,providerThreadId:thread,providerCustomerId:row.contactRef??"0",providerInboxOrChannelId:row.inboxRef??"0",inboxId:row.inboxRef??"0",state:"HANDOFF_REQUESTED",lastActivityAt:at,createdAt:at,updatedAt:at});
  const result=await new PostgresAssistantOutboxRepository(database).enqueue({provider,providerThreadId:thread,conversationRef:thread,actionType:"handoff",payloadFingerprint:fingerprint(`${provider}:${thread}`,"inbox_recovery",row.id),payloadJson:JSON.stringify({intent:"OTHER",handoffReason:"inbox_retry_exhausted"}),createdAt:at});
  if(result.ok && result.value.status==="inserted") {
    await new PostgresAuditRepository(database).append({actor:"assistant-worker",action:"inbox_retry_exhausted",resourceType:"webhook_inbox",resourceId:row.id,occurredAt:at});
    increment("assistant_inbox_dead_letter_total");
  }
}

export async function processAssistantInbox(database: Database,inboxId: string,support: SupportConversationProvider) {
  const row=await new PostgresAssistantWorkRepository(database).inboxById(inboxId);
  if(!row || row.status==="processed")return;
  const thread=row.conversationRef??inboxId;
  let failure: unknown;
  await withAssistantTransaction(database,async locked=>{
    const work=new PostgresAssistantWorkRepository(locked);
    const currentRow=await work.inboxById(inboxId);
    if(!currentRow || currentRow.status==="processed")return;
    let attemptedId=inboxId;
    try {
      // The savepoint rolls back the whole turn while the outer transaction keeps
      // its conversation lock through failure accounting. Concurrent fifth retries
      // therefore see the committed count before attempting another provider read.
      await withAssistantTransaction(locked,async bound=>{
        if(currentRow.attemptCount>=5) {
          await requestInboxRecovery(bound,currentRow,support.provider);
          return;
        }
        const pending=await new PostgresAssistantWorkRepository(bound).pendingConversation(currentRow.provider,thread);
        // Lifecycle events must latch ownership/closure before a reopened article.
        for(const lifecycle of pending.filter(r=>!r.messageRef)) {
          if(lifecycle.attemptCount>=5)await requestInboxRecovery(bound,lifecycle,support.provider);
          else {attemptedId=lifecycle.id;await processAssistantInboxLocked(bound,lifecycle.id,support);}
          if(lifecycle.id===inboxId)return;
        }
        attemptedId=inboxId;
        const current=await resolveNormalizedMessage(bound,currentRow,support);
        if(current && isPriorityEscalation(current.text)) {
          await processAssistantInboxLocked(bound,inboxId,support);
          return;
        }
        for(const earlier of pending.filter(r=>!!r.messageRef)) {
          if(earlier.attemptCount>=5) {await requestInboxRecovery(bound,earlier,support.provider);continue;}
          attemptedId=earlier.id;
          await processAssistantInboxLocked(bound,earlier.id,support);
          if(earlier.id===inboxId)return;
        }
        throw new Error("conversation_backlog_requires_recovery");
      });
    }catch(error){
      const failed=await work.processingFailed(attemptedId);
      if(failed && failed.attemptCount>=5)await requestInboxRecovery(locked,failed,support.provider);
      failure=error;
    }
  },`yubi:${support.provider}:${thread}`);
  if(failure)throw new Error("assistant_processing_failed",{cause:failure});
}

export async function processAssistantJob(inboxId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const database = createDatabase(databaseUrl);
  const support = createSupportProvider();
  try {await processAssistantInbox(database,inboxId,support);} finally {const {closeDatabase}=await import("@yubie/persistence");await closeDatabase(database);}
}

export function activeSupportProviderName() {
  return resolveSupportProviderName();
}
