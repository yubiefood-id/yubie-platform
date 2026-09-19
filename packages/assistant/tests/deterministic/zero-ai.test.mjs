import assert from "node:assert/strict";
import test from "node:test";

test("deterministic router never invokes model provider", async () => {
  const { ThrowingModelProvider } = await import("../../dist/model-providers.js");
  const { createConversationEngineRouter, createInitialFlowState } = await import("../../dist/index.js");

  const throwing = new ThrowingModelProvider();
  let modelCalls = 0;
  throwing.generate = async () => {
    modelCalls += 1;
    throw new Error("model_provider_invoked");
  };

  const prev = process.env.BOT_ENGINE;
  process.env.BOT_ENGINE = "deterministic";

  const router = createConversationEngineRouter({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
    legacyProcessor: async () => {
      await throwing.generate({ systemPrompt: "", userMessage: "", tools: [], maxTokens: 1 });
      return { kind: "noop", intent: "OTHER", risk: "GREEN", metrics: [] };
    },
  });

  const flows = [
    { text: "menu", state: "BOT_ACTIVE" },
    { text: "1", state: "BOT_ACTIVE" },
    { text: "1", state: "BOT_ACTIVE" },
    { text: "1", state: "BOT_ACTIVE" },
    { text: "0", state: "BOT_ACTIVE" },
    { text: "alergi", state: "BOT_ACTIVE" },
    { text: "5", state: "BOT_ACTIVE" },
  ];

  let flowState = createInitialFlowState();
  for (const step of flows) {
    flowState.nodeId = step.text === "1" && flowState.nodeId === "home" ? "home" : flowState.nodeId;
    const result = await router.process({
      message: {
        conversationId: "t1",
        messageId: `m-${step.text}`,
        contactId: "c1",
        inboxId: "i1",
        text: step.text,
        locale: "id",
        receivedAt: new Date().toISOString(),
      },
      conversationState: step.state,
      flowState,
    });
    if (result.nextFlowState) flowState = result.nextFlowState;
  }

  process.env.BOT_ENGINE = prev;
  assert.equal(modelCalls, 0);
});
