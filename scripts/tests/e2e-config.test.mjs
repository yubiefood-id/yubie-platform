import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const [name, variables] of [
  ["real staging cannot target production", { YUBIE_E2E_TIER: "staging", BASE_URL: "https://yubiefood.com", EXPECTED_RELEASE_SHA: "a".repeat(40) }],
  ["staging requires a reviewed release identity", { YUBIE_E2E_TIER: "staging", EXPECTED_RELEASE_SHA: "" }],
  ["sandbox cannot reuse shared staging", { YUBIE_E2E_TIER: "sandbox", BASE_URL: "https://staging.yubiefood.com", API_BASE_URL: "https://api-staging.yubiefood.com", EXPECTED_RELEASE_SHA: "a".repeat(40) }],
  ["unknown test tiers never silently run mocks", { YUBIE_E2E_TIER: "production" }],
  ["prebuilt catalog cannot silently run mocked commerce", { YUBIE_E2E_TIER: "mock", E2E_CATALOG_PREBUILT: "1" }],
  ["sandbox requires explicit scoped authorization", { YUBIE_E2E_TIER: "sandbox", BASE_URL: "https://sandbox-web.example.invalid", API_BASE_URL: "https://sandbox-api.example.invalid", EXPECTED_RELEASE_SHA: "a".repeat(40) }],
]) {
  test(name, () => {
    const result = spawnSync(process.execPath, ["node_modules/playwright/cli.js", "test", "--list"], {
      cwd: new URL("../../", import.meta.url),
      env: { ...process.env, BASE_URL: "", API_BASE_URL: "", EXPECTED_RELEASE_SHA: "", ...variables },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(result.status, 1, "unsafe configuration must fail before browser/server startup");
    assert.match(result.stdout + result.stderr, /E2E_CONFIG/);
  });
}
