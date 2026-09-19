import { createHash } from "node:crypto";
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
  FakeChatwootClient,
  HttpChatwootClient,
  parseAgentBotEvent,
  type ChatwootClient,
} from "@yubie/integrations";
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

export function createChatwootClient(): ChatwootClient {
  if (process.env.CHAT_PROVIDER === "fake" || !process.env.CHATWOOT_API_TOKEN) {
    return new FakeChatwootClient();
  }
  return new HttpChatwootClient(
    process.env.CHATWOOT_BASE_URL ?? "http://localhost:3000",
    process.env.CHATWOOT_API_TOKEN ?? "",
    process.env.CHATWOOT_ACCOUNT_ID ?? "1",
  );
}

function fingerprint(conversationRef: string, actionType: string, payload: string) {
  return createHash("sha256").update(`${conversationRef}:${actionType}:${payload}`).digest("hex");
}

export async function processAssistantInbox(database: Database, inboxId: string, chatwoot: ChatwootClient) {
  const inboxRepo = new PostgresWebhookInboxRepository(database);
  await inboxRepo.markProcessing(inboxId);

  const rows = await database.db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)).limit(1);
  const row = rows[0];
  if (!row) return;

  let event: unknown;
  if (row.rawBody) {
    event = JSON.parse(row.rawBody) as unknown;
  } else if (row.messageRef && row.conversationRef) {
    const messages = await chatwoot.getRecentMessages(row.conversationRef, 1);
    const msg = messages.find((m) => String(m.id) === row.messageRef);
    if (!msg) {
      await inboxRepo.markFailed(inboxId, "message_not_found");
      return;
    }
    event = {
      event: "message_created",
      id: Number(row.messageRef),
      content: msg.content,
      message_type: msg.messageType === "incoming" ? "incoming" : "outgoing",
      conversation: { id: Number(row.conversationRef), inbox_id: Number(row.inboxRef ?? 1) },
      sender: { id: Number(row.contactRef ?? 0) },
      created_at: msg.createdAt,
    };
  } else {
    await inboxRepo.markFailed(inboxId, "no_event_source");
    return;
  }

  const message = parseAgentBotEvent(event as import("@yubie/integrations").AgentBotWebhookEvent);
  if (!message) {
    await inboxRepo.markProcessed(inboxId, new Date().toISOString());
    return;
  }

  const now = new Date().toISOString();
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

  const sessionResult = await sessions.getByChatwootId(message.conversationId);
  let conversationState: ConversationState = sessionResult.ok && sessionResult.value ? sessionResult.value.state : "BOT_ELIGIBLE";

  const cwStatus = await chatwoot.getConversationStatus(message.conversationId);
  if (cwStatus.status === "open") {
    conversationState = "HUMAN_ACTIVE";
  }

  const upsertResult = await sessions.upsert({
    chatwootConversationId: message.conversationId,
    chatwootContactId: message.contactId,
    inboxId: message.inboxId,
    state: conversationState === "BOT_ELIGIBLE" ? "BOT_ACTIVE" : conversationState,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const sessionId = upsertResult.ok ? upsertResult.value : `session-${message.conversationId}`;
  const envConfig = loadAssistantConfig();
  const mode = configSnapshot.mode as "shadow" | "suggestion" | "auto";
  const autoReplyEnabled = envConfig.autoReplyEnabled && configSnapshot.assistantEnabled;
  const allowedGreenIntents = new Set(configSnapshot.allowedGreenIntents as import("@yubie/domain").AssistantIntent[]);

  const contextProvider = new ChatwootConversationContextProvider(chatwoot);
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
    await sessions.updateState(message.conversationId, "HANDOFF_REQUESTED", now);
    const labels = outcome.intent.startsWith("B2B") ? ["b2b", "human-required"] : ["human-required"];
    if (outcome.intent === "FOOD_SAFETY") labels.push("food-safety");
    const payload = JSON.stringify({ labels });
    await outbox.enqueue({
      runId,
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
    }),
  );

  await inboxRepo.markProcessed(inboxId, now);
}

export async function processAssistantJob(inboxId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const database = createDatabase(databaseUrl);
  const chatwoot = createChatwootClient();
  await processAssistantInbox(database, inboxId, chatwoot);
}
