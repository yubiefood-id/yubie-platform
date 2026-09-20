import assert from "node:assert/strict";
import test from "node:test";

const databaseUrl = process.env.DATABASE_URL;

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

async function loadRouter() {
  const { createConversationEngineRouter, createInitialFlowState } = await import("@yubie/assistant");
  return createConversationEngineRouter({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
  });
}

async function loadPersistence() {
  const { createDatabase, closeDatabase } = await import("@yubie/persistence");
  const db = createDatabase(databaseUrl);
  return {
    db,
    async close() {
      await closeDatabase(db);
    },
  };
}

test("flow continues buy path after reload from postgres", { skip: !databaseUrl }, async () => {
  const { db, close } = await loadPersistence();
  const repo = new (await import("@yubie/persistence")).PostgresConversationFlowStateRepository(db);
  const router = await loadRouter();
  const provider = "fake";
  const threadId = `flow-buy-${Date.now()}`;
  const now = new Date().toISOString();

  let flowState = (await import("@yubie/assistant")).createInitialFlowState();
  const first = await router.process({
    message: { conversationId: threadId, messageId: "m1", contactId: "c1", inboxId: "i1", text: "1", locale: "id", receivedAt: now },
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
  assert.equal(loaded.value?.nodeId, "buy");

  const second = await router.process({
    message: { conversationId: threadId, messageId: "m2", contactId: "c1", inboxId: "i1", text: "1", locale: "id", receivedAt: now },
    conversationState: "BOT_ACTIVE",
    flowState: {
      nodeId: loaded.value.nodeId,
      flowVersion: loaded.value.flowVersion,
      context: loaded.value.context,
      fallbackCount: loaded.value.fallbackCount,
    },
  });
  assert.equal(second.nextFlowState?.nodeId, "buy.flour");
  await close();
});

test("second unknown input increments fallback and hands off", { skip: !databaseUrl }, async () => {
  const router = await loadRouter();
  let flowState = (await import("@yubie/assistant")).createInitialFlowState();
  const now = new Date().toISOString();
  const base = {
    conversationId: "fb-test",
    contactId: "c1",
    inboxId: "i1",
    locale: "id",
    receivedAt: now,
  };

  const first = await router.process({
    message: { ...base, messageId: "m1", text: "zzz" },
    conversationState: "BOT_ACTIVE",
    flowState,
  });
  flowState = first.nextFlowState ?? flowState;
  assert.equal(flowState.fallbackCount, 1);

  const second = await router.process({
    message: { ...base, messageId: "m2", text: "yyy" },
    conversationState: "BOT_ACTIVE",
    flowState,
  });
  assert.equal(second.kind, "handoff");
});

test("B2B collect persists context_jsonb across turns", { skip: !databaseUrl }, async () => {
  const { db, close } = await loadPersistence();
  const repo = new (await import("@yubie/persistence")).PostgresConversationFlowStateRepository(db);
  const router = await loadRouter();
  const provider = "fake";
  const threadId = `b2b-${Date.now()}`;
  const now = new Date().toISOString();
  let flowState = (await import("@yubie/assistant")).createInitialFlowState();

  const enter = await router.process({
    message: { conversationId: threadId, messageId: "m1", contactId: "c1", inboxId: "i1", text: "4", locale: "id", receivedAt: now },
    conversationState: "BOT_ACTIVE",
    flowState,
  });
  flowState = enter.nextFlowState ?? flowState;
  const sample = await router.process({
    message: { conversationId: threadId, messageId: "m2", contactId: "c1", inboxId: "i1", text: "1", locale: "id", receivedAt: now },
    conversationState: "BOT_ACTIVE",
    flowState,
  });
  flowState = sample.nextFlowState ?? flowState;
  const company = await router.process({
    message: { conversationId: threadId, messageId: "m3", contactId: "c1", inboxId: "i1", text: "PT Kafe Nusantara", locale: "id", receivedAt: now },
    conversationState: "BOT_ACTIVE",
    flowState,
  });
  flowState = company.nextFlowState ?? flowState;
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
  assert.equal(loaded.value?.context.company, "PT Kafe Nusantara");
  await close();
});

test("duplicate outbox fingerprint is rejected on second enqueue", { skip: !databaseUrl }, async () => {
  const { createDatabase, closeDatabase, PostgresAssistantOutboxRepository } = await import("@yubie/persistence");
  const db = createDatabase(databaseUrl);
  const outbox = new PostgresAssistantOutboxRepository(db);
  const now = new Date().toISOString();
  const payload = JSON.stringify({ content: "same reply" });
  const fingerprint = `duplicate-fp-test-${Date.now()}`;
  const conversationRef = `dup-thread-${Date.now()}`;
  const first = await outbox.enqueue({
    provider: "fake",
    providerThreadId: conversationRef,
    conversationRef,
    actionType: "reply",
    payloadFingerprint: fingerprint,
    payloadJson: payload,
    createdAt: now,
  });
  const second = await outbox.enqueue({
    provider: "fake",
    providerThreadId: conversationRef,
    conversationRef,
    actionType: "reply",
    payloadFingerprint: fingerprint,
    payloadJson: payload,
    createdAt: now,
  });
  assert.equal(first.ok, true);
  assert.equal(first.value.status, "inserted");
  assert.equal(second.ok, true);
  assert.equal(second.value.status, "duplicate");
  assert.equal(second.value.id, first.value.id);
  await closeDatabase(db);
});
