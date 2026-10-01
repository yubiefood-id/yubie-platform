import assert from "node:assert/strict";
import test from "node:test";
import {
  DEV_DEFAULT_ZAMMAD_WHATSAPP_ARTICLE_TYPE,
  DEV_FIXTURE_ZAMMAD_GROUP_IDS,
  inspectRuntimeConfig,
  parseBotEngineName,
  parseRuntimeConfig,
  parseSupportProviderName,
  parseYubieEnvName,
  resolveZammadRouting,
  RuntimeConfigError,
} from "../dist/index.js";

const VALID_ZAMMAD_STAGING = {
  YUBIE_ENV: "staging",
  SUPPORT_PROVIDER: "zammad",
  BOT_ENGINE: "deterministic",
  ZAMMAD_BASE_URL: "https://support-staging.example.com",
  ZAMMAD_API_TOKEN: "token-staging",
  ZAMMAD_WEBHOOK_SECRET: "secret-staging",
  ZAMMAD_WEBHOOK_BEARER: "bearer-staging",
  ZAMMAD_WHATSAPP_ARTICLE_TYPE: "whatsapp-message",
  ZAMMAD_GROUP_BOT_QUEUE: "10",
  ZAMMAD_GROUP_CUSTOMER_SUPPORT: "11",
  ZAMMAD_GROUP_SALES_PARTNERSHIP: "12",
  ZAMMAD_GROUP_FOOD_SAFETY: "13",
  ZAMMAD_PRIORITY_HIGH: "3",
};

function expectConfigError(env) {
  try {
    parseRuntimeConfig(env);
  } catch (error) {
    assert.ok(error instanceof RuntimeConfigError, "error should be RuntimeConfigError");
    assert.ok(error.message.startsWith("CONFIG_ERROR:"), `prefix in: ${error.message}`);
    return error.message;
  }
  assert.fail("expected parseRuntimeConfig to throw");
}

test("valid development fake config starts", () => {
  const config = parseRuntimeConfig({ YUBIE_ENV: "development", SUPPORT_PROVIDER: "fake" });
  assert.equal(config.env, "development");
  assert.equal(config.supportProvider, "fake");
  assert.equal(config.botEngine, "deterministic");
  assert.equal(config.zammad, undefined);
});

test("empty env defaults to development fake deterministic", () => {
  const config = parseRuntimeConfig({});
  assert.equal(config.env, "development");
  assert.equal(config.supportProvider, "fake");
  assert.equal(config.botEngine, "deterministic");
});

test("valid staging zammad config starts with real values", () => {
  const config = parseRuntimeConfig(VALID_ZAMMAD_STAGING);
  assert.equal(config.env, "staging");
  assert.equal(config.supportProvider, "zammad");
  assert.equal(config.zammad.baseUrl, "https://support-staging.example.com");
  assert.equal(config.zammad.whatsappArticleType, "whatsapp-message");
  assert.equal(config.zammad.groupIds.foodSafety, "13");
  assert.equal(config.zammad.priorityHigh, "3");
});

test("staging zammad with missing API token fails closed", () => {
  const message = expectConfigError({ ...VALID_ZAMMAD_STAGING, ZAMMAD_API_TOKEN: "" });
  assert.match(message, /ZAMMAD_API_TOKEN/);
});

test("production zammad with missing API token fails closed", () => {
  const message = expectConfigError({
    ...VALID_ZAMMAD_STAGING,
    YUBIE_ENV: "production",
    ZAMMAD_API_TOKEN: "",
  });
  assert.match(message, /ZAMMAD_API_TOKEN/);
});

test("dev zammad with missing API token also fails (no silent fake substitution)", () => {
  const message = expectConfigError({
    YUBIE_ENV: "development",
    SUPPORT_PROVIDER: "zammad",
    ZAMMAD_BASE_URL: "http://localhost:8080",
  });
  assert.match(message, /ZAMMAD_API_TOKEN/);
});

test("typo support provider fails instead of falling back to fake", () => {
  const message = expectConfigError({ YUBIE_ENV: "staging", SUPPORT_PROVIDER: "zamamd" });
  assert.match(message, /zamamd/);
  assert.match(message, /fake, chatwoot, zammad/);
  // also in development: no silent fake fallback anywhere
  assert.throws(() => parseRuntimeConfig({ SUPPORT_PROVIDER: "zamamd" }), RuntimeConfigError);
});

test("typo via legacy CHAT_PROVIDER alias fails too", () => {
  const message = expectConfigError({ CHAT_PROVIDER: "chatwot" });
  assert.match(message, /CHAT_PROVIDER/);
});

test("CHAT_PROVIDER alias still resolves when SUPPORT_PROVIDER unset", () => {
  const resolved = parseSupportProviderName({ CHAT_PROVIDER: "chatwoot" });
  assert.equal(resolved.name, "chatwoot");
  assert.equal(resolved.source, "CHAT_PROVIDER");
});

test("SUPPORT_PROVIDER wins over CHAT_PROVIDER", () => {
  const resolved = parseSupportProviderName({ SUPPORT_PROVIDER: "zammad", CHAT_PROVIDER: "fake" });
  assert.equal(resolved.name, "zammad");
  assert.equal(resolved.source, "SUPPORT_PROVIDER");
});

test("staging missing food safety group id fails closed", () => {
  const message = expectConfigError({ ...VALID_ZAMMAD_STAGING, ZAMMAD_GROUP_FOOD_SAFETY: "" });
  assert.match(message, /ZAMMAD_GROUP_FOOD_SAFETY/);
});

test("production missing customer support group id fails closed", () => {
  const message = expectConfigError({
    ...VALID_ZAMMAD_STAGING,
    YUBIE_ENV: "production",
    ZAMMAD_GROUP_CUSTOMER_SUPPORT: "",
  });
  assert.match(message, /ZAMMAD_GROUP_CUSTOMER_SUPPORT/);
});

test("staging missing high priority fails closed (food-safety invariant)", () => {
  const message = expectConfigError({ ...VALID_ZAMMAD_STAGING, ZAMMAD_PRIORITY_HIGH: "" });
  assert.match(message, /ZAMMAD_PRIORITY_HIGH/);
});

test("staging missing whatsapp article type fails closed", () => {
  const message = expectConfigError({ ...VALID_ZAMMAD_STAGING, ZAMMAD_WHATSAPP_ARTICLE_TYPE: "" });
  assert.match(message, /ZAMMAD_WHATSAPP_ARTICLE_TYPE/);
});

test("dev missing article type uses explicit development default only", () => {
  const config = parseRuntimeConfig({
    YUBIE_ENV: "development",
    SUPPORT_PROVIDER: "zammad",
    ZAMMAD_BASE_URL: "http://localhost:8080",
    ZAMMAD_API_TOKEN: "dev-token",
  });
  assert.equal(config.zammad.whatsappArticleType, DEV_DEFAULT_ZAMMAD_WHATSAPP_ARTICLE_TYPE);
});

test("explicit article type is preserved exactly", () => {
  const config = parseRuntimeConfig({
    ...VALID_ZAMMAD_STAGING,
    ZAMMAD_WHATSAPP_ARTICLE_TYPE: "sms",
  });
  assert.equal(config.zammad.whatsappArticleType, "sms");
});

test("staging with neither webhook secret nor bearer fails closed", () => {
  const message = expectConfigError({
    ...VALID_ZAMMAD_STAGING,
    ZAMMAD_WEBHOOK_SECRET: "",
    ZAMMAD_WEBHOOK_BEARER: "",
  });
  assert.match(message, /ZAMMAD_WEBHOOK_SECRET/);
  assert.match(message, /ZAMMAD_WEBHOOK_BEARER/);
});

test("staging with bearer only (no hmac secret) is accepted per auth policy", () => {
  const config = parseRuntimeConfig({ ...VALID_ZAMMAD_STAGING, ZAMMAD_WEBHOOK_SECRET: "" });
  assert.equal(config.zammad.webhookSecret, undefined);
  assert.equal(config.zammad.webhookBearer, "bearer-staging");
});

test("production fake support provider is rejected", () => {
  const message = expectConfigError({ YUBIE_ENV: "production", SUPPORT_PROVIDER: "fake" });
  assert.match(message, /fake is not allowed/);
  const stagingMessage = expectConfigError({ YUBIE_ENV: "staging", SUPPORT_PROVIDER: "fake" });
  assert.match(stagingMessage, /fake is not allowed/);
});

test("staging chatwoot rollback path requires real chatwoot credentials", () => {
  const message = expectConfigError({ YUBIE_ENV: "staging", SUPPORT_PROVIDER: "chatwoot" });
  assert.match(message, /CHATWOOT_API_TOKEN/);
  assert.match(message, /CHATWOOT_BASE_URL/);
});

test("BOT_ENGINE deterministic accepted, typos rejected", () => {
  assert.equal(parseBotEngineName("deterministic"), "deterministic");
  assert.equal(parseBotEngineName("legacy"), "legacy");
  assert.equal(parseBotEngineName(undefined), "deterministic");
  assert.throws(() => parseBotEngineName("determinitsic"), RuntimeConfigError);
  assert.throws(() => parseBotEngineName("determinstic"), RuntimeConfigError);
  const message = expectConfigError({ ...VALID_ZAMMAD_STAGING, BOT_ENGINE: "determinstic" });
  assert.match(message, /BOT_ENGINE/);
});

test("YUBIE_ENV parsing rejects unknown tiers", () => {
  assert.equal(parseYubieEnvName(undefined), "development");
  assert.equal(parseYubieEnvName("Staging"), "staging");
  assert.throws(() => parseYubieEnvName("prod"), RuntimeConfigError);
});

test("non-numeric group ids fail validation", () => {
  const message = expectConfigError({
    ...VALID_ZAMMAD_STAGING,
    ZAMMAD_GROUP_FOOD_SAFETY: "fourth-group",
  });
  assert.match(message, /numeric Zammad group id/);
  assert.throws(
    () => resolveZammadRouting({ ...VALID_ZAMMAD_STAGING, ZAMMAD_PRIORITY_HIGH: "high" }),
    RuntimeConfigError,
  );
});

test("real installation whose ids genuinely are 1-4 is allowed in staging", () => {
  const config = parseRuntimeConfig({
    ...VALID_ZAMMAD_STAGING,
    ZAMMAD_GROUP_BOT_QUEUE: "1",
    ZAMMAD_GROUP_CUSTOMER_SUPPORT: "2",
    ZAMMAD_GROUP_SALES_PARTNERSHIP: "3",
    ZAMMAD_GROUP_FOOD_SAFETY: "4",
    ZAMMAD_PRIORITY_HIGH: "1",
  });
  assert.equal(config.zammad.groupIds.foodSafety, "4");
});

test("dev zammad without group ids falls back to documented fixtures", () => {
  const routing = resolveZammadRouting({
    YUBIE_ENV: "development",
    SUPPORT_PROVIDER: "zammad",
  });
  assert.deepEqual(routing.groupIds, { ...DEV_FIXTURE_ZAMMAD_GROUP_IDS });
  assert.equal(routing.priorityHigh, undefined);
});

test("invalid base URL fails", () => {
  const message = expectConfigError({ ...VALID_ZAMMAD_STAGING, ZAMMAD_BASE_URL: "not a url" });
  assert.match(message, /ZAMMAD_BASE_URL/);
});

test("error aggregation reports every missing variable at once", () => {
  const message = expectConfigError({
    YUBIE_ENV: "staging",
    SUPPORT_PROVIDER: "zammad",
  });
  for (const variable of [
    "ZAMMAD_BASE_URL",
    "ZAMMAD_API_TOKEN",
    "ZAMMAD_WHATSAPP_ARTICLE_TYPE",
    "ZAMMAD_GROUP_BOT_QUEUE",
    "ZAMMAD_GROUP_CUSTOMER_SUPPORT",
    "ZAMMAD_GROUP_SALES_PARTNERSHIP",
    "ZAMMAD_GROUP_FOOD_SAFETY",
    "ZAMMAD_PRIORITY_HIGH",
    "ZAMMAD_WEBHOOK_SECRET",
  ]) {
    assert.match(message, new RegExp(variable));
  }
});

test("secrets never appear in error messages", () => {
  const message = expectConfigError({
    YUBIE_ENV: "staging",
    SUPPORT_PROVIDER: "zammad",
    ZAMMAD_API_TOKEN: "super-secret-token-value",
    ZAMMAD_WEBHOOK_SECRET: "super-secret-hmac-value",
  });
  assert.ok(!message.includes("super-secret-token-value"), `token leaked in: ${message}`);
  assert.ok(!message.includes("super-secret-hmac-value"), `secret leaked in: ${message}`);
});

test("inspectRuntimeConfig is non-throwing for readiness checks", () => {
  const ok = inspectRuntimeConfig({ YUBIE_ENV: "development", SUPPORT_PROVIDER: "fake" });
  assert.equal(ok.ok, true);
  const bad = inspectRuntimeConfig({ YUBIE_ENV: "staging", SUPPORT_PROVIDER: "zamamd" });
  assert.equal(bad.ok, false);
  assert.ok(Array.isArray(bad.errors));
  assert.ok(bad.errors.every((e) => e.startsWith("CONFIG_ERROR:")));
});

test("does not mutate or depend on process.env when env injected", () => {
  const snapshot = JSON.stringify({ ...process.env });
  parseRuntimeConfig({ ...VALID_ZAMMAD_STAGING });
  assert.equal(JSON.stringify({ ...process.env }), snapshot);
  assert.ok(!("ZAMMAD_API_TOKEN" in { ...process.env }) || process.env.ZAMMAD_API_TOKEN !== "token-staging");
});

test("readiness of test environment fake config", () => {
  const config = parseRuntimeConfig({ YUBIE_ENV: "test", SUPPORT_PROVIDER: "fake" });
  assert.equal(config.env, "test");
  assert.equal(config.supportProvider, "fake");
});
