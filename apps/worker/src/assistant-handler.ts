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
} from "@yubie/assistant";
import type { ConversationState } from "@yubie/domain";
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
import { eq } from "drizzle-orm";
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
      : null;
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

export async function processAssistantInbox(
  database: Database,
  inboxId: string,
  support: SupportConversationProvider,
) {
  const inboxRepo = new PostgresWebhookInboxRepository(database);
  await inboxRepo.markProcessing(inboxId);

  const rows = await database.db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)).limit(1);
  const row = rows[0];
  if (!row) return;

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

  if (!configSnapshot.assistantEnabled || configSnapshot.mode === "off") {
    await inboxRepo.markProcessed(inboxId, now);
    return;
  }

  const threadRef = { provider, threadId: message.conversationId };
  const sessionResult = await sessions.getByProviderThreadId(provider, message.conversationId);
  let conversationState: ConversationState =
    sessionResult.ok && sessionResult.value ? sessionResult.value.state : "BOT_ELIGIBLE";

  const humanState = await support.getCurrentHumanState(threadRef);
  if (humanState.humanActive) {
    conversationState = "HUMAN_ACTIVE";
  }

  await sessions.upsert({
    provider,
    providerThreadId: message.conversationId,
    providerCustomerId: message.contactId,
    providerInboxOrChannelId: message.inboxId,
    providerLastMessageId: message.messageId,
    ...(provider === "chatwoot"
      ? { chatwootConversationId: message.conversationId, chatwootContactId: message.contactId }
      : {}),
    inboxId: message.inboxId,
    state: conversationState === "BOT_ELIGIBLE" ? "BOT_ACTIVE" : conversationState,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const sessionId =
    sessionResult.ok && sessionResult.value ? sessionResult.value.id : `session-${message.conversationId}`;
  const botEngine = resolveBotEngine();
  const started = Date.now();

  const existingFlow = await flowStates.get(provider, message.conversationId);
  const initialFlow = createInitialFlowState();
  const flowState = existingFlow.ok && existingFlow.value
    ? {
        nodeId: existingFlow.value.nodeId,
        flowVersion: existingFlow.value.flowVersion,
        context: existingFlow.value.context,
        fallbackCount: existingFlow.value.fallbackCount,
      }
    : initialFlow;

  const router = createConversationEngineRouter({
    knowledge,
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
    conversationState,
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
    classifierVersion: botEngine === "deterministic" ? FLOW_VERSION : CLASSIFIER_VERSION,
    policyVersion: POLICY_VERSION,
    knowledgeVersion: configSnapshot.knowledgeVersion,
    modelProvider: botEngine,
    modelName: botEngine === "deterministic" ? "none" : (process.env.VLLM_MODEL ?? "default"),
    promptVersion: botEngine === "deterministic" ? FLOW_VERSION : PROMPT_VERSION,
    validatorOutcome: engineResult.kind,
    latencyMs: Date.now() - started,
    outcome: engineResult.kind,
    createdAt: now,
  };
  if (engineResult.kind === "handoff" && engineResult.handoffReason) {
    runRecord.handoffReason = engineResult.handoffReason;
  }
  await runs.insert(runRecord);

  if (engineResult.kind === "handoff") {
    await sessions.updateState(provider, message.conversationId, "HANDOFF_REQUESTED", now);
    const dest = mapHandoffDestination(engineResult.handoffDestination);
    const handoffConfig: Parameters<typeof buildHandoffCommand>[3] = {};
    if (dest) handoffConfig.destination = dest;
    if (engineResult.nodeId) handoffConfig.nodeId = engineResult.nodeId;
    const handoff = buildHandoffCommand(
      threadRef,
      engineResult.intent,
      engineResult.handoffReason,
      handoffConfig,
    );
    const payload = JSON.stringify({
      labels: handoff.labels,
      intent: engineResult.intent,
      handoffReason: engineResult.handoffReason,
      groupId: handoff.groupId,
      priorityId: handoff.priorityId,
      destination: engineResult.handoffDestination,
    });
    await outbox.enqueue({
      runId,
      provider,
      providerThreadId: message.conversationId,
      conversationRef: message.conversationId,
      actionType: "handoff",
      payloadFingerprint: fingerprint(message.conversationId, "handoff", payload),
      payloadJson: payload,
      createdAt: now,
    });
    await runs.insertAction({ runId, actionType: "handoff", detailsJson: payload, createdAt: now });

    if (engineResult.text) {
      const replyPayload = JSON.stringify({ content: engineResult.text });
      await outbox.enqueue({
        runId,
        provider,
        providerThreadId: message.conversationId,
        conversationRef: message.conversationId,
        actionType: "reply",
        payloadFingerprint: fingerprint(message.conversationId, "reply-handoff", replyPayload),
        payloadJson: replyPayload,
        createdAt: now,
      });
      await runs.insertAction({ runId, actionType: "reply", detailsJson: replyPayload, createdAt: now });
    }
  } else if (engineResult.kind === "reply" && engineResult.text) {
    const payload = JSON.stringify({ content: engineResult.text });
    await outbox.enqueue({
      runId,
      provider,
      providerThreadId: message.conversationId,
      conversationRef: message.conversationId,
      actionType: "reply",
      payloadFingerprint: fingerprint(message.conversationId, "reply", payload),
      payloadJson: payload,
      createdAt: now,
    });
    await runs.insertAction({ runId, actionType: "reply", detailsJson: payload, createdAt: now });
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
      conversationRef: message.conversationId,
      provider,
    }),
  );

  await inboxRepo.markProcessed(inboxId, now);
}

export async function processAssistantJob(inboxId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const database = createDatabase(databaseUrl);
  const support = createSupportProvider();
  await processAssistantInbox(database, inboxId, support);
}

export function activeSupportProviderName() {
  return resolveSupportProviderName();
}
