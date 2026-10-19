import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { erpStockWriteDecision } from "../dist/index.js";

test("ERP stock writes stay closed until one stock owner is proven", () => {
  const decision = erpStockWriteDecision();
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "dual_master_unproven");
});

test("first-party checkout consults the ERP write gate", () => {
  const source = readFileSync(new URL("../src/use-cases/first-party-checkout.ts", import.meta.url), "utf8");
  assert.equal(source.includes("erpStockWriteDecision"), true);
  assert.equal(source.includes("erpnext"), false);
});
