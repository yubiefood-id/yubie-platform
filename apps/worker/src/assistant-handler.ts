import { createHash } from "node:crypto";
import type { SupportConversationProvider } from "@yubie/application";
import {
  createModelProviderFromEnv,
  DefaultResponseValidator,
  DeterministicRiskPolicy,
  KnowledgeToolRegistry,
  loadAssistantConfig,
  POLICY_VERSION,
  PROMPT_VERSION,
  RuleBasedIntentClassifier,
  RuleOnlyStructuredClassifier,
  runAssistantPipeline,
  SYSTEM_PROMPT_V1,
  CLASSIFIER_VERSION,
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
  PostgresConversationSessionRepository,
  PostgresKnowledgeRepository,
  PostgresRuntimeConfigRepository,
  PostgresWebhookInboxRepository,
  webhookInbox,
  type Database,
} from "@yubie/persistence";
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
  const envConfig = loadAssistantConfig();
  const mode = configSnapshot.mode as "shadow" | "suggestion" | "auto";
  const autoReplyEnabled = envConfig.autoReplyEnabled && configSnapshot.assistantEnabled;
  const allowedGreenIntents = new Set(configSnapshot.allowedGreenIntents as import("@yubie/domain").AssistantIntent[]);

  const contextProvider = createContextProvider(support);
  const conversationContext = await contextProvider.fetchContext(message.conversationId);
  const structuredClassifier = new RuleOnlyStructuredClassifier();
  const tools = new KnowledgeToolRegistry({ knowledge });
  const started = Date.now();
  const outcome = await runAssistantPipeline(message, conversationState, {
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

  const runId = runs.nextRunId();
  const runRecord: import("@yubie/persistence").AssistantRunRecord = {
    id: runId,
    sessionId,
    inboxEventId: inboxId,
    conversationRef: message.conversationId,
    messageRef: message.messageId,
    intent: outcome.intent,
    risk: outcome.risk,
    classifierVersion: CLASSIFIER_VERSION,
    policyVersion: POLICY_VERSION,
    knowledgeVersion: configSnapshot.knowledgeVersion,
    modelProvider: process.env.MODEL_PROVIDER ?? "fake",
    modelName: process.env.VLLM_MODEL ?? "default",
    promptVersion: PROMPT_VERSION,
    validatorOutcome: outcome.kind,
    latencyMs: Date.now() - started,
    outcome: outcome.kind,
    createdAt: now,
  };
  if (outcome.kind === "handoff" && outcome.handoffReason) {
    runRecord.handoffReason = outcome.handoffReason;
  }
  await runs.insert(runRecord);

  if (outcome.kind === "handoff") {
    await sessions.updateState(provider, message.conversationId, "HANDOFF_REQUESTED", now);
    const handoff = buildHandoffCommand(threadRef, outcome.intent, outcome.handoffReason);
    const payload = JSON.stringify({
      labels: handoff.labels,
      intent: outcome.intent,
      handoffReason: outcome.handoffReason,
      groupId: handoff.groupId,
      priorityId: handoff.priorityId,
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
  } else if (outcome.kind === "reply" && outcome.text) {
    const payload = JSON.stringify({ content: outcome.text });
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
  } else if ("suggestionText" in outcome && outcome.suggestionText) {
    await runs.insertAction({
      runId,
      actionType: "suggestion",
      detailsJson: JSON.stringify({ text: outcome.suggestionText }),
      createdAt: now,
    });
  }

  console.log(
    JSON.stringify({
      event: "assistant.turn",
      inboxId,
      runId,
      intent: outcome.intent,
      risk: outcome.risk,
      outcome: outcome.kind,
      latencyMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
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
