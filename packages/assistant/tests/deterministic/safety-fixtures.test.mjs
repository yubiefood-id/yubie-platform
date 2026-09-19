import assert from "node:assert/strict";
import test from "node:test";

const knowledge = { async getEffectivePublicKnowledge() { return null; } };

async function run(text, nodeId = "home") {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({ knowledge });
  return engine.processTurn({
    text,
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId, flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
}

test("human aliases always handoff", async () => {
  for (const text of ["manusia", "hubungi tim", "customer service"]) {
    const result = await run(text);
    assert.equal(result.action.kind, "handoff");
    assert.equal(result.action.destination, "CUSTOMER_SUPPORT");
  }
});

test("adverse reaction handoff food safety", async () => {
  const result = await run("ada reaksi buruk setelah makan");
  assert.equal(result.action.kind, "handoff");
  assert.equal(result.action.destination, "FOOD_SAFETY");
});

test("refund commitment routes to human", async () => {
  const result = await run("3", "order.shopee");
  assert.equal(result.action.kind, "handoff");
});
