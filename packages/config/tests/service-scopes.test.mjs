import assert from "node:assert/strict";
import test from "node:test";
import { inspectServiceRuntimeConfig, parseServiceRuntimeConfig, RuntimeConfigError } from "../dist/index.js";

const STAGING = { YUBIE_ENV: "staging" };

test("bot scope: webhook secret only — NO Zammad API/base/routing required", () => {
  const config = parseServiceRuntimeConfig(
    { ...STAGING, SUPPORT_PROVIDER: "zammad", ZAMMAD_WEBHOOK_SECRET: "whsec" },
    "bot",
  );
  assert.equal(config.service, "bot");
  assert.equal(config.supportProvider, "zammad");
  assert.equal(config.commerce, undefined, "bot never receives the commerce/xendit contract");

  // The same env must FAIL the worker scope: the worker really needs the API.
  const worker = inspectServiceRuntimeConfig(
    { ...STAGING, SUPPORT_PROVIDER: "zammad", ZAMMAD_WEBHOOK_SECRET: "whsec" },
    "worker",
  );
  assert.equal(worker.ok, false);
  assert.ok(worker.errors.join(" ").includes("ZAMMAD_BASE_URL"));
});

test("bot scope fails closed when the selected provider's webhook secret is missing", () => {
  assert.throws(
    () => parseServiceRuntimeConfig({ ...STAGING, SUPPORT_PROVIDER: "zammad" }, "bot"),
    /bot service with SUPPORT_PROVIDER=zammad requires ZAMMAD_WEBHOOK_SECRET/,
  );
  assert.throws(
    () => parseServiceRuntimeConfig({ ...STAGING, SUPPORT_PROVIDER: "chatwoot" }, "bot"),
    /CHATWOOT_AGENTBOT_SECRET/,
  );
  assert.throws(
    () => parseServiceRuntimeConfig({ ...STAGING, SUPPORT_PROVIDER: "fake" }, "bot"),
    /cannot run SUPPORT_PROVIDER=fake/,
  );
});

test("api scope requires API_PROXY_TOKEN in staging/production; development may omit it", () => {
  const base = {
    YUBIE_ENV: "staging",
    COMMERCE_PROVIDER: "preview",
    DATABASE_URL: "postgresql://localhost/yubie",
    PURCHASE_OPTIONS_SOURCE: "database",
    API_PROXY_TOKEN: "hop",
  };
  assert.equal(parseServiceRuntimeConfig(base, "api").commerce.provider, "preview");

  delete base.API_PROXY_TOKEN;
  assert.throws(() => parseServiceRuntimeConfig(base, "api"), /api service in staging requires API_PROXY_TOKEN/);

  const dev = parseServiceRuntimeConfig({ ...base, YUBIE_ENV: "development" }, "api");
  assert.equal(dev.env, "development");
});

test("api scope never requires support-provider secrets; worker scope does", () => {
  const api = parseServiceRuntimeConfig(
    { YUBIE_ENV: "development", COMMERCE_PROVIDER: "preview" },
    "api",
  );
  assert.equal(api.supportProvider, "fake", "api defaults without any ZAMMAD_* present");
});

test("SUPPORT_PROVIDER=disabled lets the worker run bot-off production without any support secrets", () => {
  // Production worker with commerce enabled and no Zammad/Chatwoot values at all.
  const worker = parseServiceRuntimeConfig(
    {
      YUBIE_ENV: "production",
      SUPPORT_PROVIDER: "disabled",
      COMMERCE_PROVIDER: "preview",
      INVENTORY_MODE: "lots",
      DATABASE_URL: "postgresql://localhost/yubie",
      PURCHASE_OPTIONS_SOURCE: "database",
      YUBIE_LAUNCH_PROFILE: "DIRECT_COMMERCE_PRODUCTION",
    },
    "worker",
  );
  assert.equal(worker.supportProvider, "disabled");
  assert.equal(worker.commerce.provider, "preview");

  // The same shape with the provider merely UNSET still fails closed.
  const unset = inspectServiceRuntimeConfig(
    {
      YUBIE_ENV: "production",
      COMMERCE_PROVIDER: "preview",
      DATABASE_URL: "postgresql://localhost/yubie",
    },
    "worker",
  );
  assert.equal(unset.ok, false);
  assert.ok(unset.errors.join(" ").includes("SUPPORT_PROVIDER=fake is not allowed"));

  // A typo'd provider name must never be treated as disabled.
  assert.throws(
    () => parseServiceRuntimeConfig({ YUBIE_ENV: "production", SUPPORT_PROVIDER: "disbled" }, "worker"),
    /SUPPORT_PROVIDER must be one of/,
  );
});

test("bot service refuses to run when support is disabled", () => {
  assert.throws(
    () => parseServiceRuntimeConfig({ YUBIE_ENV: "production", SUPPORT_PROVIDER: "disabled" }, "bot"),
    /bot service cannot run with SUPPORT_PROVIDER=disabled/,
  );
});
