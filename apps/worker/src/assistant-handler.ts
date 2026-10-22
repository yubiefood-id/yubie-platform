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
} from "@yubie/assistant";
import { resolveYubiProduct, type ConversationState } from "@yubie/domain";
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
import { eq, sql } from "drizzle-orm";
import {
  createDatabase,
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


  const rows = await database.db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)).limit(1);
  const row = rows[0];
  if (!row || row.status === "processed") return;
  await inboxRepo.markProcessing(inboxId);

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
  if(!safety && provider==="zammad" && lastMessageId && /^\d+$/.test(lastMessageId) && BigInt(message.messageId)<=BigInt(lastMessageId)) {await inboxRepo.markProcessed(inboxId,now);return;}
  let conversationState: ConversationState =
    sessionResult.ok && sessionResult.value ? sessionResult.value.state : "BOT_ELIGIBLE";

  const humanState = await support.getCurrentHumanState(threadRef);
  if (humanState.humanActive) {
    conversationState = "HUMAN_ACTIVE";
  }
  if(conversationState==="RESOLVED" && sessionResult.ok && sessionResult.value?.botReleasedAt && sessionResult.value.resolvedAt && Date.now()-Date.parse(sessionResult.value.resolvedAt)>=30*60*1000 && !humanState.humanActive && !humanState.automationDisabled && ["menu","start"].includes(message.text.trim().toLowerCase())) {
    conversationState="BOT_ELIGIBLE";
    await database.db.execute(sql`UPDATE conversation_sessions SET bot_released_at=NULL WHERE provider=${provider} AND provider_thread_id=${message.conversationId}`);
  }

  const savedSession = await sessions.upsert({
    provider,
    providerThreadId: message.conversationId,
    providerCustomerId: message.contactId,
    providerInboxOrChannelId: message.inboxId,
    providerLastMessageId: provider === "zammad" && lastMessageId && /^\d+$/.test(lastMessageId) && BigInt(lastMessageId)>BigInt(message.messageId) ? lastMessageId : message.messageId,
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

  const engineResult = await router.process({
    message,
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
    if(engineResult.handoffDestination==="SALES_PARTNERSHIP")await database.db.execute(sql`UPDATE conversation_flow_state SET context_jsonb = '{}'::jsonb WHERE provider=${provider} AND provider_thread_id=${message.conversationId}`);
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

export async function processAssistantInbox(database: Database,inboxId: string,support: SupportConversationProvider) {
  const rows=await database.db.select().from(webhookInbox).where(eq(webhookInbox.id,inboxId)).limit(1);
  if(!rows[0])return;
  const thread=rows[0].conversationRef ?? inboxId;
  try {await database.db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`yubi:${support.provider}:${thread}`},0))`);
    const bound={db:tx,client:database.client} as unknown as Database;
    await processAssistantInboxLocked(bound,inboxId,support);
  });}catch(error){
    await database.db.execute(sql`UPDATE webhook_inbox SET attempt_count=attempt_count+1,status='failed',last_error='ASSISTANT_PROCESSING_FAILED' WHERE id=${inboxId} AND status<>'processed'`);
    throw new Error("assistant_processing_failed",{cause:error});
  }
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
