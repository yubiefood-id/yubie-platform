import assert from "node:assert/strict";
import test from "node:test";
import {
  BITESHIP_API_ORIGIN,
  RuntimeConfigError,
  inspectShippingRuntimeConfig,
  parseBiteshipEnvName,
  parseShippingExecutionModeName,
  parseShippingProviderName,
  parseShippingRuntimeConfig,
} from "../dist/index.js";

const BITLESS = {
  SHIPPING_PROVIDER: "biteship",
  BITESHIP_ENV: "sandbox",
  BITESHIP_API_KEY: "biteship_test_key_placeholder",
  BITESHIP_WEBHOOK_SECRET: "webhook-secret-placeholder",
  BITESHIP_WEBHOOK_SECRET_HEADER: "x-biteship-secret",
};

test("shipping execution mode defaults to disabled and rejects typos", () => {
  assert.equal(parseShippingExecutionModeName(undefined), "disabled");
  assert.equal(parseShippingExecutionModeName(""), "disabled");
  for (const mode of ["disabled", "shadow", "sandbox", "pilot", "enabled"]) {
    assert.equal(parseShippingExecutionModeName(mode), mode);
  }
  assert.throws(() => parseShippingExecutionModeName("live"), /SHIPPING_EXECUTION_MODE must be one of: disabled, shadow, sandbox, pilot, enabled/);
  assert.throws(() => parseShippingExecutionModeName("pilot "), RuntimeConfigError);
});

test("shipping provider defaults to none and rejects unknown values", () => {
  assert.equal(parseShippingProviderName(undefined), "none");
  assert.equal(parseShippingProviderName("biteship"), "biteship");
  assert.throws(() => parseShippingProviderName("kiriminaja"), /SHIPPING_PROVIDER must be one of: none, biteship/);
});

test("biteship environment is explicit only", () => {
  assert.equal(parseBiteshipEnvName("sandbox"), "sandbox");
  assert.equal(parseBiteshipEnvName("production"), "production");
  assert.throws(() => parseBiteshipEnvName(undefined), /BITESHIP_ENV must be sandbox or production/);
  assert.throws(() => parseBiteshipEnvName("prod"), /BITESHIP_ENV must be sandbox or production/);
});

test("unset shipping config parses inert (provider none, mode disabled)", () => {
  const config = parseShippingRuntimeConfig({});
  assert.equal(config.provider, "none");
  assert.equal(config.mode, "disabled");
  assert.equal(config.biteshipApiKeyConfigured, false);
  assert.equal(config.biteshipEnv, null);
  assert.equal(config.pilotMaxBookings, null);
  assert.ok(inspectShippingRuntimeConfig({}).ok);
});

test("shadow mode requires an admitted provider and accepts sandbox keys", () => {
  const config = parseShippingRuntimeConfig({ ...BITLESS, SHIPPING_EXECUTION_MODE: "shadow" });
  assert.equal(config.mode, "shadow");
  assert.equal(config.biteshipEnv, "sandbox");
  assert.equal(config.biteshipApiOrigin, BITESHIP_API_ORIGIN);
  assert.equal(config.biteshipApiKeyConfigured, true);
  assert.equal(config.webhookSecretConfigured, true);
  assert.equal(config.webhookSecretHeader, "x-biteship-secret");
});

test("a non-disabled mode without a provider fails closed", () => {
  assert.throws(
    () => parseShippingRuntimeConfig({ SHIPPING_EXECUTION_MODE: "shadow" }),
    /requires SHIPPING_PROVIDER=biteship/,
  );
});

test("biteship provider requires key and environment even while disabled", () => {
  assert.throws(() => parseShippingRuntimeConfig({ SHIPPING_PROVIDER: "biteship" }), /BITESHIP_API_KEY/);
  assert.throws(
    () => parseShippingRuntimeConfig({ SHIPPING_PROVIDER: "biteship", BITESHIP_API_KEY: "k" }),
    /BITESHIP_ENV/,
  );
});

test("sandbox keys are blocked in production", () => {
  assert.throws(
    () => parseShippingRuntimeConfig({ ...BITLESS, SHIPPING_EXECUTION_MODE: "shadow", YUBIE_ENV: "production" }),
    /BITESHIP_ENV=sandbox must not be used when YUBIE_ENV=production/,
  );
});

test("sandbox mode requires BITESHIP_ENV=sandbox", () => {
  assert.throws(
    () => parseShippingRuntimeConfig({ ...BITLESS, SHIPPING_EXECUTION_MODE: "sandbox", BITESHIP_ENV: "production" }),
    /SHIPPING_EXECUTION_MODE=sandbox requires BITESHIP_ENV=sandbox/,
  );
});

test("pilot and enabled modes require production credentials and webhook verification", () => {
  const base = { ...BITLESS, BITESHIP_ENV: "production", YUBIE_ENV: "production" };
  assert.throws(
    () => parseShippingRuntimeConfig({ ...base, SHIPPING_EXECUTION_MODE: "pilot", BITESHIP_API_KEY: "k", BITESHIP_WEBHOOK_SECRET: "" }),
    /BITESHIP_WEBHOOK_SECRET/,
  );
  assert.throws(
    () => parseShippingRuntimeConfig({ ...base, SHIPPING_EXECUTION_MODE: "enabled", BITESHIP_ENV: "sandbox" }),
    /SHIPPING_EXECUTION_MODE=enabled requires BITESHIP_ENV=production/,
  );
  const enabled = parseShippingRuntimeConfig({ ...base, SHIPPING_EXECUTION_MODE: "enabled" });
  assert.equal(enabled.mode, "enabled");
  assert.equal(enabled.pilotMaxBookings, null);
  assert.equal(enabled.pilotBudgetIdr, null);
});

test("pilot mode requires explicit bounded budget and booking count", () => {
  const base = { ...BITLESS, BITESHIP_ENV: "production", YUBIE_ENV: "production", SHIPPING_EXECUTION_MODE: "pilot" };
  assert.throws(() => parseShippingRuntimeConfig(base), /SHIPPING_PILOT_MAX_BOOKINGS/);
  assert.throws(
    () => parseShippingRuntimeConfig({ ...base, SHIPPING_PILOT_MAX_BOOKINGS: "5" }),
    /SHIPPING_PILOT_BUDGET_IDR/,
  );
  const pilot = parseShippingRuntimeConfig({ ...base, SHIPPING_PILOT_MAX_BOOKINGS: "5", SHIPPING_PILOT_BUDGET_IDR: "500000" });
  assert.equal(pilot.pilotMaxBookings, 5);
  assert.equal(pilot.pilotBudgetIdr, 500000);
  assert.throws(
    () => parseShippingRuntimeConfig({ ...base, SHIPPING_PILOT_MAX_BOOKINGS: "0", SHIPPING_PILOT_BUDGET_IDR: "500000" }),
    /SHIPPING_PILOT_MAX_BOOKINGS must be a positive integer/,
  );
  assert.throws(
    () => parseShippingRuntimeConfig({ ...base, SHIPPING_PILOT_MAX_BOOKINGS: "5", SHIPPING_PILOT_BUDGET_IDR: "-1" }),
    /SHIPPING_PILOT_BUDGET_IDR must be a positive integer/,
  );
});

test("BITESHIP_API_BASE_URL must be the pinned official origin", () => {
  assert.throws(
    () => parseShippingRuntimeConfig({ ...BITLESS, SHIPPING_EXECUTION_MODE: "shadow", BITESHIP_API_BASE_URL: "https://evil.example.com" }),
    /BITESHIP_API_BASE_URL must be https:\/\/api.biteship.com/,
  );
  const pinned = parseShippingRuntimeConfig({
    ...BITLESS,
    SHIPPING_EXECUTION_MODE: "shadow",
    BITESHIP_API_BASE_URL: "https://api.biteship.com/",
  });
  assert.equal(pinned.biteshipApiOrigin, BITESHIP_API_ORIGIN);
});

test("production biteship keys refuse to run outside production", () => {
  assert.throws(
    () => parseShippingRuntimeConfig({ ...BITLESS, SHIPPING_EXECUTION_MODE: "shadow", BITESHIP_ENV: "production", YUBIE_ENV: "staging" }),
    /BITESHIP_ENV=production requires YUBIE_ENV=production/,
  );
});

test("SHIPPING_FREE_SUBSIDY_MAX_IDR is an optional positive-integer activation lever", () => {
  const base = { ...BITLESS, SHIPPING_EXECUTION_MODE: "shadow" };
  const unset = parseShippingRuntimeConfig(base);
  assert.equal(unset.freeSubsidyMaxIdr, null, "unset keeps plain free shipping (no auto-booking)");
  const armed = parseShippingRuntimeConfig({ ...base, SHIPPING_FREE_SUBSIDY_MAX_IDR: "50000" });
  assert.equal(armed.freeSubsidyMaxIdr, 50000);
  assert.throws(
    () => parseShippingRuntimeConfig({ ...base, SHIPPING_FREE_SUBSIDY_MAX_IDR: "0" }),
    /SHIPPING_FREE_SUBSIDY_MAX_IDR must be a positive integer/,
  );
});
