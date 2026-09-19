import assert from "node:assert/strict";
import test from "node:test";
import {
  DefaultResponseValidator,
  DeterministicRiskPolicy,
  FakeModelProvider,
  InMemoryToolRegistry,
  RuleBasedIntentClassifier,
  runAssistantPipeline,
  SYSTEM_PROMPT_V1,
} from "../dist/index.js";

test("multi-turn context prefixes user message for model", async () => {
  const model = new FakeModelProvider();
  const originalGenerate = model.generate.bind(model);
  let capturedUserMessage = "";
  model.generate = async (req) => {
    capturedUserMessage = req.userMessage;
    return originalGenerate(req);
  };

  await runAssistantPipeline(
    {
      conversationId: "c1",
      messageId: "m2",
      contactId: "u1",
      inboxId: "i1",
      text: "yubie flour 500g ada?",
      locale: "id",
      receivedAt: new Date().toISOString(),
    },
    "BOT_ACTIVE",
    {
      classifier: new RuleBasedIntentClassifier(),
      riskPolicy: new DeterministicRiskPolicy(),
      tools: new InMemoryToolRegistry(),
      model,
      validator: new DefaultResponseValidator(),
      systemPrompt: SYSTEM_PROMPT_V1,
      autoReplyEnabled: true,
      allowedGreenIntents: new Set(["PRODUCT_INFO"]),
      mode: "shadow",
      conversationContext: {
        recentTurns: [{ role: "customer", text: "ada flour?" }],
        customerLanguage: "id",
      },
    },
  );

  assert.match(capturedUserMessage, /ada flour\?/);
  assert.match(capturedUserMessage, /500g ada\?/);
});
