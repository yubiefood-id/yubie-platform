import assert from "node:assert/strict";
import test from "node:test";

test("BOT_ENGINE deterministic resolves by default", async () => {
  const prev = process.env.BOT_ENGINE;
  delete process.env.BOT_ENGINE;
  const { resolveBotEngine } = await import("@yubie/assistant");
  assert.equal(resolveBotEngine(), "deterministic");
  process.env.BOT_ENGINE = prev;
});

test("deterministic engine processes menu without model", async () => {
  const { createConversationEngineRouter, createInitialFlowState } = await import("@yubie/assistant");
  process.env.BOT_ENGINE = "deterministic";
  const router = createConversationEngineRouter({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
  });
  const result = await router.process({
    message: {
      conversationId: "99",
      messageId: "m1",
      contactId: "c1",
      inboxId: "i1",
      text: "menu",
      locale: "id",
      receivedAt: new Date().toISOString(),
    },
    conversationState: "BOT_ACTIVE",
    flowState: createInitialFlowState(),
  });
  assert.equal(result.kind, "reply");
  assert.match(result.text, /Yubie/);
});

test("flow state persists across turns when database available", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const { createDatabase, closeDatabase, PostgresConversationFlowStateRepository } = await import("@yubie/persistence");
  const { createConversationEngineRouter, createInitialFlowState } = await import("@yubie/assistant");
  const db = createDatabase(process.env.DATABASE_URL);
  const repo = new PostgresConversationFlowStateRepository(db);
  const provider = "fake";
  const threadId = `flow-test-${Date.now()}`;
  const now = new Date().toISOString();

  let flowState = createInitialFlowState();
  const router = createConversationEngineRouter({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
  });

  const first = await router.process({
    message: {
      conversationId: threadId,
      messageId: "m1",
      contactId: "c1",
      inboxId: "i1",
      text: "1",
      locale: "id",
      receivedAt: now,
    },
    conversationState: "BOT_ACTIVE",
    flowState,
  });
  flowState = first.nextFlowState ?? flowState;
  await repo.upsert({
    provider,
    providerThreadId: threadId,
    flowVersion: flowState.flowVersion,
    nodeId: flowState.nodeId,
    context: flowState.context,
    fallbackCount: flowState.fallbackCount,
    lastTransitionAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const loaded = await repo.get(provider, threadId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value?.nodeId, "buy");

  const second = await router.process({
    message: {
      conversationId: threadId,
      messageId: "m2",
      contactId: "c1",
      inboxId: "i1",
      text: "9",
      locale: "id",
      receivedAt: now,
    },
    conversationState: "BOT_ACTIVE",
    flowState: {
      nodeId: loaded.value.nodeId,
      flowVersion: loaded.value.flowVersion,
      context: loaded.value.context,
      fallbackCount: loaded.value.fallbackCount,
    },
  });
  assert.equal(second.nextFlowState?.nodeId, "home");
  await closeDatabase(db);
});
