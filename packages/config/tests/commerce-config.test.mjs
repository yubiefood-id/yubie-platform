import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectCommerceRuntimeConfig,
  parseCommerceProviderName,
  parseCommerceRuntimeConfig,
  parsePurchaseOptionsSourceName,
  RuntimeConfigError,
} from "../dist/index.js";

const XENDIT_BASE = {
  COMMERCE_PROVIDER: "xendit",
  DATABASE_URL: "postgresql://yubie:yubie@127.0.0.1:5432/yubie_test",
  XENDIT_SECRET_KEY: "xnd_test_secret",
  XENDIT_WEBHOOK_TOKEN: "callback-token",
  XENDIT_BUSINESS_ID: "biz-123",
  APP_ORIGIN: "https://yubiefood.com",
};

test("unset commerce defaults to preview with static listings and no database", () => {
  const config = parseCommerceRuntimeConfig({});
  assert.equal(config.provider, "preview");
  assert.equal(config.purchaseOptionsSource, "static");
  assert.equal(config.databaseConfigured, false);
  assert.equal(config.appOrigin, null);
});

test("purchase options source defaults to database when DATABASE_URL is present", () => {
  const config = parseCommerceRuntimeConfig({ DATABASE_URL: "postgresql://localhost/yubie" });
  assert.equal(config.purchaseOptionsSource, "database");
});

test("unknown COMMERCE_PROVIDER value fails closed with the offending value", () => {
  assert.throws(() => parseCommerceProviderName("xendti"), /COMMERCE_PROVIDER must be one of: preview, xendit, ipaymu, disabled \(received "xendti"\)/);
  assert.throws(() => parseCommerceRuntimeConfig({ COMMERCE_PROVIDER: "live" }), RuntimeConfigError);
});

test("unknown PURCHASE_OPTIONS_SOURCE value fails closed", () => {
  assert.throws(
    () => parsePurchaseOptionsSourceName({ PURCHASE_OPTIONS_SOURCE: "databse", DATABASE_URL: "postgresql://localhost/yubie" }),
    /PURCHASE_OPTIONS_SOURCE must be one of: static, database/,
  );
});

test("PURCHASE_OPTIONS_SOURCE=database without DATABASE_URL fails closed", () => {
  assert.throws(
    () => parsePurchaseOptionsSourceName({ PURCHASE_OPTIONS_SOURCE: "database" }),
    /PURCHASE_OPTIONS_SOURCE=database requires DATABASE_URL/,
  );
});

test("valid xendit configuration parses", () => {
  const config = parseCommerceRuntimeConfig(XENDIT_BASE);
  assert.equal(config.provider, "xendit");
  assert.equal(config.databaseConfigured, true);
  assert.equal(config.appOrigin, "https://yubiefood.com");
});

test("xendit aggregates every missing required variable", () => {
  let message = "";
  try {
    parseCommerceRuntimeConfig({ COMMERCE_PROVIDER: "xendit" });
    assert.fail("expected CONFIG_ERROR");
  } catch (error) {
    message = String(error);
  }
  for (const varName of ["DATABASE_URL", "XENDIT_SECRET_KEY", "XENDIT_WEBHOOK_TOKEN", "XENDIT_BUSINESS_ID", "APP_ORIGIN"]) {
    assert.ok(message.includes(varName), `error names ${varName}`);
  }
  // Never the secret values themselves.
  assert.ok(!message.includes("xnd_test_secret"));
});

test("xendit rejects a non-https APP_ORIGIN (Xendit return URLs must be HTTPS)", () => {
  assert.throws(
    () => parseCommerceRuntimeConfig({ ...XENDIT_BASE, APP_ORIGIN: "http://yubiefood.com" }),
    /APP_ORIGIN must be an https URL/,
  );
  assert.throws(
    () => parseCommerceRuntimeConfig({ ...XENDIT_BASE, APP_ORIGIN: "not-a-url" }),
    /APP_ORIGIN must be a valid URL/,
  );
});

test("inspect variant returns errors instead of throwing", () => {
  const inspection = inspectCommerceRuntimeConfig({ COMMERCE_PROVIDER: "xendit" });
  assert.equal(inspection.ok, false);
  assert.ok(inspection.errors.length >= 1);
  assert.equal(inspectCommerceRuntimeConfig(XENDIT_BASE).ok, true);
});

test("INVENTORY_MODE is validated and lot-gating is required for deployment xendit", () => {
  assert.equal(parseCommerceRuntimeConfig({ INVENTORY_MODE: "lots" }).inventoryMode, "lots");
  assert.equal(parseCommerceRuntimeConfig({}).inventoryMode, "none");

  assert.throws(() => parseCommerceRuntimeConfig({ INVENTORY_MODE: "lotss" }), /INVENTORY_MODE must be one of: none, lots/);

  // Development may wire xendit without lots (local integration), but
  // staging/production must prove released-lot sellability.
  const development = parseCommerceRuntimeConfig({ ...XENDIT_BASE, INVENTORY_MODE: "none", YUBIE_ENV: "development" });
  assert.equal(development.inventoryMode, "none");

  assert.throws(
    () => parseCommerceRuntimeConfig({ ...XENDIT_BASE, YUBIE_ENV: "production" }),
    /INVENTORY_MODE=lots/,
  );
  assert.equal(parseCommerceRuntimeConfig({ ...XENDIT_BASE, YUBIE_ENV: "production", INVENTORY_MODE: "lots" }).inventoryMode, "lots");
});

const IPAYMU_BASE = {
  COMMERCE_PROVIDER: "ipaymu",
  IPAYMU_ENV: "sandbox",
  IPAYMU_VA: "sandbox-va",
  IPAYMU_API_KEY: "sandbox-key",
  IPAYMU_NOTIFY_URL: "https://api-staging.yubiefood.com/v1/webhooks/ipaymu",
  DATABASE_URL: "postgresql://yubie:yubie@127.0.0.1:5432/yubie_test",
  APP_ORIGIN: "https://staging.yubiefood.com",
  INVENTORY_MODE: "lots",
  YUBIE_ENV: "staging",
};

test("ipaymu sandbox configuration parses and never echoes secrets", () => {
  const config = parseCommerceRuntimeConfig(IPAYMU_BASE);
  assert.equal(config.provider, "ipaymu");
  assert.equal(config.inventoryMode, "lots");
});

test("ipaymu refuses cross-env credentials and missing secrets by name only", () => {
  // Production credentials can never run in a staging-shaped deployment.
  assert.throws(() => parseCommerceRuntimeConfig({ ...IPAYMU_BASE, IPAYMU_ENV: "production" }), /YUBIE_ENV=production/);
  assert.throws(
    () => parseCommerceRuntimeConfig({ ...IPAYMU_BASE, IPAYMU_API_BASE_URL: "https://my.ipaymu.com/api/v2" }),
    /sandbox\.ipaymu\.com/,
  );
  assert.throws(() => parseCommerceRuntimeConfig({ ...IPAYMU_BASE, IPAYMU_NOTIFY_URL: "http://127.0.0.1/hook" }), /public https URL/);
  let message = "";
  try {
    parseCommerceRuntimeConfig({ COMMERCE_PROVIDER: "ipaymu", IPAYMU_API_KEY: "sandbox-key", IPAYMU_VA: "sandbox-va" });
  } catch (error) {
    message = String(error);
  }
  assert.match(message, /IPAYMU_VA|IPAYMU_API_KEY|IPAYMU_NOTIFY_URL|IPAYMU_ENV/);
  assert.equal(message.includes("sandbox-key"), false);
  assert.equal(message.includes("sandbox-va"), false);
});

test("ipaymu production requires explicit production environment and exact production origin", () => {
  const PRODUCTION_BASE = {
    ...IPAYMU_BASE,
    IPAYMU_ENV: "production",
    YUBIE_ENV: "production",
    APP_ORIGIN: "https://yubiefood.com",
    IPAYMU_NOTIFY_URL: "https://api.yubiefood.com/v1/webhooks/ipaymu",
  };
  assert.equal(parseCommerceRuntimeConfig(PRODUCTION_BASE).provider, "ipaymu");
  assert.equal(parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, IPAYMU_API_BASE_URL: "https://my.ipaymu.com" }).provider, "ipaymu");
  assert.throws(() => parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, YUBIE_ENV: "staging" }), /YUBIE_ENV=production/);
  assert.throws(() => parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, YUBIE_ENV: "development" }), /YUBIE_ENV=production/);
  // Cross-environment and spoofed origins are rejected in both directions.
  assert.throws(() => parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, IPAYMU_API_BASE_URL: "https://sandbox.ipaymu.com" }), /my\.ipaymu\.com/);
  assert.throws(() => parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, IPAYMU_API_BASE_URL: "https://my.ipaymu.com.evil.tld" }), /my\.ipaymu\.com/);
  assert.throws(() => parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, IPAYMU_API_BASE_URL: "https://my.ipaymu.com:8443" }), /my\.ipaymu\.com/);
  assert.throws(() => parseCommerceRuntimeConfig({ ...PRODUCTION_BASE, IPAYMU_API_BASE_URL: "http://my.ipaymu.com" }), /my\.ipaymu\.com/);
  // Sandbox env keeps parsing with its own exact origin.
  assert.equal(parseCommerceRuntimeConfig(IPAYMU_BASE).provider, "ipaymu");
});

test("checkout admission switch parses explicitly and fails closed on typos", () => {
  assert.equal(parseCommerceRuntimeConfig(IPAYMU_BASE).checkoutAdmission, "enabled");
  assert.equal(parseCommerceRuntimeConfig({ ...IPAYMU_BASE, YUBIE_CHECKOUT_ADMISSION: "disabled" }).checkoutAdmission, "disabled");
  assert.throws(
    () => parseCommerceRuntimeConfig({ ...IPAYMU_BASE, YUBIE_CHECKOUT_ADMISSION: "disbled" }),
    /YUBIE_CHECKOUT_ADMISSION must be one of/,
  );
});
