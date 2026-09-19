import assert from "node:assert/strict";
import test from "node:test";

test("does not send reply when conversation is human active", async () => {
  const { FakeChatwootClient } = await import("@yubie/integrations");
  const { RuleBasedIntentClassifier, DeterministicRiskPolicy, FakeModelProvider, DefaultResponseValidator, InMemoryToolRegistry, runAssistantPipeline, SYSTEM_PROMPT_V1 } = await import("@yubie/assistant");

  const chatwoot = new FakeChatwootClient();
  chatwoot.statuses.set("42", "open");

  const msg = {
    conversationId: "42",
    messageId: "m1",
    contactId: "c1",
    inboxId: "i1",
    text: "apa itu yubie flour",
    locale: "id",
    receivedAt: new Date().toISOString(),
  };

  const outcome = await runAssistantPipeline(msg, "HUMAN_ACTIVE", {
    classifier: new RuleBasedIntentClassifier(),
    riskPolicy: new DeterministicRiskPolicy(),
    tools: new InMemoryToolRegistry(),
    model: new FakeModelProvider(),
    validator: new DefaultResponseValidator(),
    systemPrompt: SYSTEM_PROMPT_V1,
    autoReplyEnabled: true,
    allowedGreenIntents: new Set(["PRODUCT_INFO"]),
    mode: "auto",
  });

  if (outcome.kind === "reply" && outcome.text) {
    await chatwoot.sendMessage(msg.conversationId, outcome.text);
  }

  const status = await chatwoot.getConversationStatus("42");
  assert.equal(status.status, "open");
  assert.equal(chatwoot.messages.length, 0, "must not send auto reply during human active");
  assert.notEqual(outcome.kind, "reply");
});
