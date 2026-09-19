import {
  createModelProviderFromEnv,
  DefaultResponseValidator,
  DeterministicRiskPolicy,
  InMemoryToolRegistry,
  loadAssistantConfig,
  RuleBasedIntentClassifier,
  runAssistantPipeline,
  SYSTEM_PROMPT_V1,
  PROMPT_VERSION,
} from "@yubie/assistant";
import type { ConversationState } from "@yubie/domain";
import { FakeChatwootClient, HttpChatwootClient, parseAgentBotEvent, type ChatwootClient } from "@yubie/integrations";
import { eq } from "drizzle-orm";
import {
  createDatabase,
  PostgresConversationSessionRepository,
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

export async function processAssistantInbox(database: Database, inboxId: string, chatwoot: ChatwootClient) {
  const rows = await database.db.select().from(webhookInbox).where(eq(webhookInbox.id, inboxId)).limit(1);
  const row = rows[0];
  if (!row) return;

  const inboxRepo = new PostgresWebhookInboxRepository(database);
  const sessions = new PostgresConversationSessionRepository(database);
  const event = JSON.parse(row.rawBody) as unknown;
  const message = parseAgentBotEvent(event as import("@yubie/integrations").AgentBotWebhookEvent);
  if (!message) {
    await inboxRepo.markProcessed(inboxId, new Date().toISOString());
    return;
  }

  const now = new Date().toISOString();
  const sessionResult = await sessions.getByChatwootId(message.conversationId);
  let conversationState: ConversationState = sessionResult.ok && sessionResult.value ? sessionResult.value.state : "BOT_ELIGIBLE";

  const cwStatus = await chatwoot.getConversationStatus(message.conversationId);
  if (cwStatus.status === "open") {
    conversationState = "HUMAN_ACTIVE";
  }

  await sessions.upsert({
    chatwootConversationId: message.conversationId,
    chatwootContactId: message.contactId,
    inboxId: message.inboxId,
    state: conversationState === "BOT_ELIGIBLE" ? "BOT_ACTIVE" : conversationState,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const config = loadAssistantConfig();
  const started = Date.now();
  const outcome = await runAssistantPipeline(message, conversationState, {
    classifier: new RuleBasedIntentClassifier(),
    riskPolicy: new DeterministicRiskPolicy(),
    tools: new InMemoryToolRegistry(),
    model: createModelProviderFromEnv(),
    validator: new DefaultResponseValidator(),
    systemPrompt: SYSTEM_PROMPT_V1,
    autoReplyEnabled: config.autoReplyEnabled,
    allowedGreenIntents: config.allowedGreenIntents,
    mode: config.mode,
  });

  if (outcome.kind === "handoff") {
    await sessions.updateState(message.conversationId, "HANDOFF_REQUESTED", now);
    const labels = outcome.intent.startsWith("B2B") ? ["b2b", "human-required"] : ["human-required"];
    if (outcome.intent === "FOOD_SAFETY") labels.push("food-safety");
    await chatwoot.requestHandoff(message.conversationId, labels);
  } else if (outcome.kind === "reply" && outcome.text) {
    const latestStatus = await chatwoot.getConversationStatus(message.conversationId);
    if (latestStatus.status !== "open") {
      await chatwoot.sendMessage(message.conversationId, outcome.text);
    }
  }

  console.log(
    JSON.stringify({
      event: "assistant.turn",
      inboxId,
      intent: outcome.intent,
      risk: outcome.risk,
      outcome: outcome.kind,
      latencyMs: Date.now() - started,
      promptVersion: PROMPT_VERSION,
    }),
  );

  await inboxRepo.markProcessed(inboxId, new Date().toISOString());
}

export async function processAssistantJob(inboxId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const database = createDatabase(databaseUrl);
  const chatwoot = createChatwootClient();
  await processAssistantInbox(database, inboxId, chatwoot);
}
