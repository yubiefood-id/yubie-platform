import assert from "node:assert/strict";
import test from "node:test";

const knowledge = {
  async getEffectivePublicKnowledge() {
    return null;
  },
};

test("home menu renders on start", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({ knowledge });
  const result = await engine.processTurn({
    text: "menu",
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId: "buy", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
  assert.equal(result.action.kind, "reply");
  assert.match(result.action.text, /Selamat datang di Yubie/);
  assert.equal(result.nextState.nodeId, "home");
});

test("second unknown input hands off", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({ knowledge });
  const first = await engine.processTurn({
    text: "xyz unknown",
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId: "home", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
  assert.equal(first.action.kind, "reply");
  assert.equal(first.nextState.fallbackCount, 1);

  const second = await engine.processTurn({
    text: "xyz unknown lagi",
    conversationState: "BOT_ACTIVE",
    persisted: first.nextState,
  });
  assert.equal(second.action.kind, "handoff");
  assert.equal(second.action.destination, "CUSTOMER_SUPPORT");
});

test("complaint food safety routes to FOOD_SAFETY", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({ knowledge });
  const result = await engine.processTurn({
    text: "5",
    conversationState: "BOT_ACTIVE",
    persisted: { nodeId: "complaint", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 },
  });
  assert.equal(result.action.kind, "handoff");
  assert.equal(result.action.destination, "FOOD_SAFETY");
});

test("B2B sample collects progressively then hands off sales", async () => {
  const { DeterministicConversationEngine } = await import("../../dist/deterministic/engine.js");
  const engine = new DeterministicConversationEngine({ knowledge });
  let state = { nodeId: "business.sample.company", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 };
  const steps = ["PT Yubie Test", "R&D bakery", "flour", "Jakarta"];
  for (const value of steps) {
    const result = await engine.processTurn({ text: value, conversationState: "BOT_ACTIVE", persisted: state });
    state = result.nextState;
    if (result.action.kind === "handoff") {
      assert.equal(result.action.destination, "SALES_PARTNERSHIP");
      return;
    }
  }
  assert.fail("expected sales handoff after sample qualification");
});
