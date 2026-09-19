import assert from "node:assert/strict";
import test from "node:test";
import { FakeChatwootClient } from "@yubie/integrations";
import { closeDatabase, createDatabase, PostgresAssistantOutboxRepository } from "@yubie/persistence";
import { deliverChatwootOutbox } from "../dist/reply-delivery-handler.js";

const databaseUrl = process.env.DATABASE_URL;

test("drops reply when human has taken over in Chatwoot", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl);
  const chatwoot = new FakeChatwootClient();
  const outbox = new PostgresAssistantOutboxRepository(database);
  const conversationRef = `race-conv-${Date.now()}`;
  chatwoot.statuses.set(conversationRef, "open");

  const now = new Date().toISOString();
  const inserted = await outbox.enqueue({
    conversationRef,
    actionType: "reply",
    payloadFingerprint: `fp-race-${Date.now()}`,
    payloadJson: JSON.stringify({ content: "should not send" }),
    createdAt: now,
  });
  assert.equal(inserted.ok, true);

  await deliverChatwootOutbox(database, chatwoot, inserted.value.id);
  assert.equal(chatwoot.messages.length, 0);
  await closeDatabase(database);
});

test("delivers reply when conversation is not human active", { skip: !databaseUrl }, async () => {
  const database = createDatabase(databaseUrl);
  const chatwoot = new FakeChatwootClient();
  const outbox = new PostgresAssistantOutboxRepository(database);
  const conversationRef = `ok-conv-${Date.now()}`;

  const now = new Date().toISOString();
  const inserted = await outbox.enqueue({
    conversationRef,
    actionType: "reply",
    payloadFingerprint: `fp-ok-${Date.now()}`,
    payloadJson: JSON.stringify({ content: "Halo dari Yubie" }),
    createdAt: now,
  });

  await deliverChatwootOutbox(database, chatwoot, inserted.value.id);
  assert.equal(chatwoot.messages.length, 1);
  assert.equal(chatwoot.messages[0].content, "Halo dari Yubie");
  await closeDatabase(database);
});
