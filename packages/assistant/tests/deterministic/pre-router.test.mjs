import assert from "node:assert/strict";
import test from "node:test";

test("human aliases trigger handoff route", async () => {
  const { preRoute } = await import("../../dist/deterministic/pre-router.js");
  const { V1_FLOW } = await import("../../dist/deterministic/flows.js");
  const state = { nodeId: "home", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 };
  assert.equal(preRoute(V1_FLOW, state, "bicara dengan admin", "BOT_ACTIVE").kind, "handoff_human");
  assert.equal(preRoute(V1_FLOW, state, "0", "BOT_ACTIVE").kind, "handoff_human");
});

test("menu alias returns home", async () => {
  const { preRoute } = await import("../../dist/deterministic/pre-router.js");
  const { V1_FLOW } = await import("../../dist/deterministic/flows.js");
  const state = { nodeId: "buy", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 };
  const route = preRoute(V1_FLOW, state, "menu", "BOT_ACTIVE");
  assert.equal(route.kind, "goto");
  assert.equal(route.nodeId, "home");
});

test("food safety patterns escalate", async () => {
  const { preRoute } = await import("../../dist/deterministic/pre-router.js");
  const { V1_FLOW } = await import("../../dist/deterministic/flows.js");
  const state = { nodeId: "home", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 };
  assert.equal(preRoute(V1_FLOW, state, "ada benda asing di kemasan", "BOT_ACTIVE").kind, "handoff_food_safety");
});

test("health patterns escalate to health handoff", async () => {
  const { preRoute } = await import("../../dist/deterministic/pre-router.js");
  const { V1_FLOW } = await import("../../dist/deterministic/flows.js");
  const state = { nodeId: "home", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 };
  assert.equal(preRoute(V1_FLOW, state, "apakah aman untuk diabetes", "BOT_ACTIVE").kind, "handoff_health");
});

test("human active yields noop", async () => {
  const { preRoute } = await import("../../dist/deterministic/pre-router.js");
  const { V1_FLOW } = await import("../../dist/deterministic/flows.js");
  const state = { nodeId: "home", flowVersion: "deterministic-v1", context: {}, fallbackCount: 0 };
  assert.equal(preRoute(V1_FLOW, state, "1", "HUMAN_ACTIVE").kind, "noop_human_active");
});
