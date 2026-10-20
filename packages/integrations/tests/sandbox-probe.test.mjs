import assert from "node:assert/strict";
import test from "node:test";
import { runSandboxProbe, sandboxProbeDecision } from "../dist/index.js";

const READY = {
  YUBIE_IPAYMU_SANDBOX_E2E: "1",
  IPAYMU_VA: "sandbox-va",
  IPAYMU_API_KEY: "sandbox-key-not-a-real-secret",
  IPAYMU_NOTIFY_URL: "https://api-staging.yubiefood.com/v1/webhooks/ipaymu",
};

test("the sandbox probe stays off unless the operator flag is exactly 1", () => {
  assert.deepEqual(sandboxProbeDecision({}), { status: "NOT_RUN", reason: "flag_off" });
  assert.equal(sandboxProbeDecision({ ...READY, YUBIE_IPAYMU_SANDBOX_E2E: "true" }).status, "NOT_RUN");
});

test("a production origin and missing secrets stay blocked", () => {
  assert.equal(sandboxProbeDecision({ ...READY, IPAYMU_API_BASE_URL: "https://my.ipaymu.com" }).reason, "production_origin");
  assert.equal(sandboxProbeDecision({ YUBIE_IPAYMU_SANDBOX_E2E: "1" }).reason, "missing_secret");
});

test("a ready probe does not call the network until run, and the report omits secrets", async () => {
  let calls = 0;
  const held = await runSandboxProbe({ YUBIE_IPAYMU_SANDBOX_E2E: "0" }, async () => {
    calls += 1;
    throw new Error("network");
  }, "probe-off");
  assert.equal(held.status, "NOT_RUN");
  assert.equal(calls, 0);

  const report = await runSandboxProbe(READY, async () => {
    calls += 1;
    return { ok: true, status: 200, async json() { return { Data: { SessionID: "sess-probe", Url: "https://sandbox.ipaymu.com/payment/sess-probe" } }; } };
  }, "probe-1");
  assert.equal(report.status, "PASS");
  assert.equal(report.redirectHost, "sandbox.ipaymu.com");
  assert.equal(JSON.stringify(report).includes(READY.IPAYMU_API_KEY), false);
  assert.equal(JSON.stringify(report).includes(READY.IPAYMU_VA), false);
  assert.equal(calls, 1);
});
