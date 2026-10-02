import assert from "node:assert/strict";
import test from "node:test";
import { ChatwootSupportProvider, FakeChatwootClient } from "@yubie/integrations";
import { closeDatabase, createDatabase, PostgresAssistantOutboxRepository } from "@yubie/persistence";
import { deliverSupportOutbox } from "../dist/reply-delivery-handler.js";

const databaseUrl = process.env.DATABASE_URL;

test("drops reply when human has taken over in Chatwoot", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl);
  const chatwoot = new FakeChatwootClient();
  const support = new ChatwootSupportProvider(chatwoot);
  const outbox = new PostgresAssistantOutboxRepository(database);
  const conversationRef = `race-conv-${Date.now()}`;
  chatwoot.statuses.set(conversationRef, "open");

  const now = new Date().toISOString();
  const inserted = await outbox.enqueue({
    provider: "chatwoot",
    providerThreadId: conversationRef,
    conversationRef,
    actionType: "reply",
    payloadFingerprint: `fp-race-${Date.now()}`,
    payloadJson: JSON.stringify({ content: "should not send" }),
    createdAt: now,
  });
  assert.equal(inserted.ok, true);

  await deliverSupportOutbox(database, support, inserted.value.id);
  assert.equal(chatwoot.messages.length, 0);
  await closeDatabase(database);
});

test("delivers reply when conversation is not human active", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl);
  const chatwoot = new FakeChatwootClient();
  const support = new ChatwootSupportProvider(chatwoot);
  const outbox = new PostgresAssistantOutboxRepository(database);
  const conversationRef = `ok-conv-${Date.now()}`;

  const now = new Date().toISOString();
  const inserted = await outbox.enqueue({
    provider: "chatwoot",
    providerThreadId: conversationRef,
    conversationRef,
    actionType: "reply",
    payloadFingerprint: `fp-ok-${Date.now()}`,
    payloadJson: JSON.stringify({ content: "Halo dari Yubie" }),
    createdAt: now,
  });

  await deliverSupportOutbox(database, support, inserted.value.id);
  assert.equal(chatwoot.messages.length, 1);
  assert.equal(chatwoot.messages[0].content, "Halo dari Yubie");
  await closeDatabase(database);
});

test("marks outbox failed when local session is HUMAN_ACTIVE", { skip: !databaseUrl }, async () => {
  const { PostgresConversationSessionRepository } = await import("@yubie/persistence");
  const database = createDatabase(databaseUrl);
  const chatwoot = new FakeChatwootClient();
  const support = new ChatwootSupportProvider(chatwoot);
  const outbox = new PostgresAssistantOutboxRepository(database);
  const sessions = new PostgresConversationSessionRepository(database);
  const conversationRef = `human-session-${Date.now()}`;
  const now = new Date().toISOString();

  await sessions.upsert({
    provider: "chatwoot",
    providerThreadId: conversationRef,
    providerCustomerId: "c1",
    providerInboxOrChannelId: "i1",
    // inbox_id is NOT NULL without a database default — the port requires it.
    inboxId: "i1",
    state: "HUMAN_ACTIVE",
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const inserted = await outbox.enqueue({
    provider: "chatwoot",
    providerThreadId: conversationRef,
    conversationRef,
    actionType: "reply",
    payloadFingerprint: `fp-human-${Date.now()}`,
    payloadJson: JSON.stringify({ content: "blocked bot reply" }),
    createdAt: now,
  });

  await deliverSupportOutbox(database, support, inserted.value.id);
  assert.equal(chatwoot.messages.length, 0);
  await closeDatabase(database);
});
