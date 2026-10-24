import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Release contract (docs/production/2026-10-24 + ROLLBACK.md R1): the FIRST
// production deployment must ship with checkout admission explicitly disabled
// — a nonchargeable, fail-closed storefront. This pins the documented env
// contract so a refactor cannot silently re-default the initial state.

test("production env contract pins YUBIE_CHECKOUT_ADMISSION=disabled for the initial deployment", () => {
  const text = readFileSync(resolve(import.meta.dirname, "../../infrastructure/production.env.example"), "utf8");
  const line = text.split("\n").find((entry) => /^YUBIE_CHECKOUT_ADMISSION=/.test(entry));
  assert.ok(line, "production.env.example must set YUBIE_CHECKOUT_ADMISSION explicitly");
  assert.equal(line.trim(), "YUBIE_CHECKOUT_ADMISSION=disabled");
});
