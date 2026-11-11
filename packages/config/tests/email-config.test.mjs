import assert from "node:assert/strict";
import test from "node:test";
import { parseEmailRuntimeConfig, inspectServiceRuntimeConfig } from "../dist/index.js";

const BASE = {
  B2B_EMAIL_DELIVERY: "enabled",
  SMTP_HOST: "smtp.privateemail.com",
  SMTP_PORT: "465",
  SMTP_USER: "enquiry@yubiefood.com",
  SMTP_PASSWORD: "secret-value",
  B2B_ENQUIRY_EMAIL_FROM: "enquiry@yubiefood.com",
};

test("email delivery is disabled (null) by default and on explicit disabled", () => {
  assert.equal(parseEmailRuntimeConfig({}, "worker"), null);
  assert.equal(parseEmailRuntimeConfig({ B2B_EMAIL_DELIVERY: "disabled" }, "worker"), null);
});

test("a typo'd delivery mode fails closed instead of silently disabling", () => {
  assert.throws(() => parseEmailRuntimeConfig({ B2B_EMAIL_DELIVERY: "enable" }, "worker"), /B2B_EMAIL_DELIVERY/);
});

test("enabled mode requires the full SMTP contract and names the missing variable", () => {
  for (const [key] of [["SMTP_HOST"], ["SMTP_USER"], ["SMTP_PASSWORD"], ["B2B_ENQUIRY_EMAIL_FROM"]]) {
    const env = { ...BASE };
    delete env[key];
    assert.throws(() => parseEmailRuntimeConfig(env, "worker"), new RegExp(key), `${key} must be required`);
  }
});

test("port and address validation: 465 implicit TLS, 587 STARTTLS, others rejected", () => {
  assert.equal(parseEmailRuntimeConfig(BASE, "worker").secure, true);
  assert.equal(parseEmailRuntimeConfig({ ...BASE, SMTP_PORT: "587" }, "worker").secure, false);
  assert.throws(() => parseEmailRuntimeConfig({ ...BASE, SMTP_PORT: "25" }, "worker"), /SMTP_PORT/);
  assert.throws(() => parseEmailRuntimeConfig({ ...BASE, B2B_ENQUIRY_EMAIL_FROM: "not-an-email" }, "worker"), /B2B_ENQUIRY_EMAIL_FROM/);
  assert.throws(() => parseEmailRuntimeConfig({ ...BASE, B2B_ENQUIRY_NOTIFY_TO: "a@b.com,broken" }, "worker"), /B2B_ENQUIRY_NOTIFY_TO/);
});

test("recipient list defaults to the team inbox and parses comma-separated values", () => {
  const defaults = parseEmailRuntimeConfig(BASE, "worker");
  assert.deepEqual(defaults.notifyTo, ["hello@yubiefood.com"]);
  assert.equal(defaults.ackEnabled, true);
  const custom = parseEmailRuntimeConfig({ ...BASE, B2B_ENQUIRY_NOTIFY_TO: "hello@yubiefood.com, ops@yubiefood.com", B2B_ENQUIRY_ACK: "disabled" }, "worker");
  assert.deepEqual(custom.notifyTo, ["hello@yubiefood.com", "ops@yubiefood.com"]);
  assert.equal(custom.ackEnabled, false);
});

test("worker startup surfaces the email axis error; disabled mode contributes none", () => {
  const missingHost = inspectServiceRuntimeConfig({ ...BASE, SMTP_HOST: undefined, YUBIE_ENV: "test" }, "worker");
  assert.equal(missingHost.ok, false, "half-configured delivery must fail closed at startup");
  assert.ok(missingHost.errors.join(";").includes("SMTP_HOST"));
  const disabled = inspectServiceRuntimeConfig({ YUBIE_ENV: "test", B2B_EMAIL_DELIVERY: "disabled" }, "worker");
  if (!disabled.ok) {
    assert.ok(!disabled.errors.join(";").includes("SMTP"), "disabled email delivery must not contribute errors");
  }
});
