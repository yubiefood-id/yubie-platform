import assert from "node:assert/strict";
import test from "node:test";

test("V1 flow validates at startup", async () => {
  const { validateFlowDefinition } = await import("../../dist/deterministic/validation.js");
  const { V1_FLOW } = await import("../../dist/deterministic/flows.js");
  const errors = validateFlowDefinition(V1_FLOW);
  assert.deepEqual(errors, []);
});
