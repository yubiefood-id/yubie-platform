import assert from "node:assert/strict";
import test from "node:test";

test("shake purchase points to the approved online catalog", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
    getPurchaseOptions: async () => ({ options: [{ marketplace: "shopee", label: "Shopee", redirectPath: "/go/shopee/flour" }] }),
  });
  const toShake = await engine.processTurn({
    text: "2",
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId: "buy", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
  assert.match(toShake.action.text, /tersedia/i);
  assert.match(toShake.action.text, /checkout/i);
});

test("flour shopee uses marketplace registry path", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
    getPurchaseOptions: async () => ({
      options: [{ marketplace: "shopee", label: "Shopee", redirectPath: "/go/shopee/yubie-flour" }],
    }),
  });
  const result = await engine.processTurn({
    text: "1",
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId: "buy.flour", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
  assert.match(result.action.text, /\/go\/shopee\/yubie-flour/);
});

test("sensitive fact absent triggers handoff", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({
    knowledge: { async getEffectivePublicKnowledge() { return null; } },
  });
  const result = await engine.processTurn({
    text: "5",
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId: "product", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
  assert.equal(result.action.kind, "handoff");
});
