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
  APP_ORIGIN: "https://yubie.id",
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
  assert.throws(() => parseCommerceProviderName("xendti"), /COMMERCE_PROVIDER must be one of: preview, xendit, disabled \(received "xendti"\)/);
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
  assert.equal(config.appOrigin, "https://yubie.id");
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
    () => parseCommerceRuntimeConfig({ ...XENDIT_BASE, APP_ORIGIN: "http://yubie.id" }),
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
