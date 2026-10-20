import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { erpStockWriteDecision, stockDiscrepancyReport } from "../dist/index.js";

test("ERP stock writes stay closed until one stock owner is proven", () => {
  const decision = erpStockWriteDecision();
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "dual_master_unproven");
});

test("the discrepancy report is read-only and sums both sides", () => {
  const report = stockDiscrepancyReport(
    [{ sku: "flour-250g", quantity: 8 }, { sku: "flour-250g", quantity: 2 }, { sku: "mie-single", quantity: 4 }],
    [{ sku: "flour-250g", quantity: 9 }],
  );
  assert.deepEqual(report, [
    { sku: "flour-250g", yubie: 10, erp: 9, delta: 1 },
    { sku: "mie-single", yubie: 4, erp: 0, delta: 4 },
  ]);
  assert.throws(() => stockDiscrepancyReport([{ sku: "flour-250g", quantity: -1 }], []), /non-negative/);
  assert.equal(erpStockWriteDecision().allowed, false);
});

test("first-party checkout consults the ERP write gate", () => {
  const source = readFileSync(new URL("../src/use-cases/first-party-checkout.ts", import.meta.url), "utf8");
  assert.equal(source.includes("erpStockWriteDecision"), true);
  assert.equal(source.includes("erpnext"), false);
});
