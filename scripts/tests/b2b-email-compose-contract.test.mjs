import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression for PR #93 / ADR-016: defining SMTP variables in an env example
// does NOT put them into a container when Compose uses explicit allowlists.
const compose = readFileSync(new URL("../../infrastructure/docker-compose.prod.yml", import.meta.url), "utf8");
const worker = compose.match(/\n  worker:\n([\s\S]*?)\n  bot:\n/)?.[1];
const api = compose.match(/\n  api:\n([\s\S]*?)\n  worker:\n/)?.[1];

test("B2B SMTP variables are mapped exclusively into the production worker", () => {
  assert.ok(worker, "worker compose service must exist");
  assert.ok(api, "api compose service must exist");
  for (const variable of [
    "B2B_EMAIL_DELIVERY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "B2B_ENQUIRY_EMAIL_FROM",
    "B2B_ENQUIRY_NOTIFY_TO",
    "B2B_ENQUIRY_ACK",
  ]) {
    assert.match(worker, new RegExp("^\\s+" + variable + ": \\$\\{" + variable + "(?::-.*)?\\}", "m"), variable + " not forwarded");
    assert.doesNotMatch(api, new RegExp("^\\s+" + variable + ":", "m"), variable + " must never reach api");
  }
  assert.match(worker, /^\s+B2B_EMAIL_DELIVERY: \$\{B2B_EMAIL_DELIVERY:-disabled\}/m);
});
