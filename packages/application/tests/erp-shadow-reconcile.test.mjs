import assert from "node:assert/strict";
import test from "node:test";
import {
  ERP_SHADOW_MAX_ATTEMPTS,
  erpShadowRetryDelayMs,
  runErpShadowReconcile,
  validateErpMappings,
} from "../dist/index.js";

const NOW = "2026-10-20T10:00:00.000Z";
const MAPPINGS = [
  { productId: "flour", sizeId: "250g", erpItemCode: "YUB-FLOUR-250", warehouse: "Released - YUB" },
  { productId: "flour", sizeId: "1kg", erpItemCode: "YUB-FLOUR-1000", warehouse: "Released - YUB" },
];

function outbox() {
  const events = [];
  return { events, async enqueue(event) { events.push(event); return { ok: true, value: undefined }; } };
}

const yubie = {
  async readSellableStock() {
    return [
      { productId: "flour", sizeId: "250g", quantity: 10 },
      { productId: "flour", sizeId: "1kg", quantity: 4 },
      { productId: "unmapped", sizeId: "x", quantity: 99 },
    ];
  },
};

test("a matching ERP read reports zero mismatches and enqueues nothing", async () => {
  const events = outbox();
  const calls = [];
  const result = await runErpShadowReconcile({
    mappings: MAPPINGS,
    erp: { async readReleasedStock(codes, warehouse) { calls.push({ codes, warehouse }); return { ok: true, value: [{ sku: "YUB-FLOUR-250", quantity: 10 }, { sku: "YUB-FLOUR-1000", quantity: 4 }] }; } },
    yubie,
    outbox: events,
    attempt: 1,
    runId: "run_1",
    now: NOW,
  });
  assert.equal(result.status, "reported");
  assert.equal(result.mismatched, 0);
  assert.equal(events.events.length, 0);
  assert.deepEqual(calls, [{ codes: ["YUB-FLOUR-250", "YUB-FLOUR-1000"], warehouse: "Released - YUB" }]);
});

test("a mismatch is reported once through the outbox and never adjusts stock", async () => {
  const events = outbox();
  const result = await runErpShadowReconcile({
    mappings: MAPPINGS,
    erp: { async readReleasedStock() { return { ok: true, value: [{ sku: "YUB-FLOUR-250", quantity: 7 }] }; } },
    yubie,
    outbox: events,
    attempt: 1,
    runId: "run_2",
    now: NOW,
  });
  assert.equal(result.status, "reported");
  assert.equal(result.mismatched, 2);
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].eventType, "erp.stock_discrepancy_reported");
  assert.equal(events.events[0].dedupeKey, "erp_shadow:run_2:report");
  const payload = JSON.parse(events.events[0].payloadJson);
  assert.deepEqual(payload.discrepancies.map((line) => [line.sku, line.delta]), [["YUB-FLOUR-1000", 4], ["YUB-FLOUR-250", 3]]);
});

test("ERP outages retry with backoff, then dead-letter for an operator", async () => {
  const erp = { async readReleasedStock() { return { ok: false, code: "unavailable" }; } };
  const first = await runErpShadowReconcile({ mappings: MAPPINGS, erp, yubie, outbox: outbox(), attempt: 1, runId: "run_3", now: NOW });
  assert.deepEqual(first, { status: "retry", attempt: 2, delayMs: 60_000, code: "unavailable" });
  assert.equal(erpShadowRetryDelayMs(10), 30 * 60_000);

  const events = outbox();
  const last = await runErpShadowReconcile({ mappings: MAPPINGS, erp, yubie, outbox: events, attempt: ERP_SHADOW_MAX_ATTEMPTS, runId: "run_3", now: NOW });
  assert.equal(last.status, "dead_letter");
  assert.equal(events.events[0].eventType, "erp.shadow_reconcile_dead_letter");
});

test("an ERP response naming an unmapped item is treated as invalid, not trusted", async () => {
  const result = await runErpShadowReconcile({
    mappings: MAPPINGS,
    erp: { async readReleasedStock() { return { ok: true, value: [{ sku: "SOMETHING-ELSE", quantity: 1 }] }; } },
    yubie,
    outbox: outbox(),
    attempt: 1,
    runId: "run_4",
    now: NOW,
  });
  assert.equal(result.status, "retry");
  assert.equal(result.code, "invalid_response");
});

test("a failed dead-letter write is loud, not swallowed", async () => {
  await assert.rejects(runErpShadowReconcile({
    mappings: MAPPINGS,
    erp: { async readReleasedStock() { return { ok: false, code: "unavailable" }; } },
    yubie,
    outbox: { async enqueue() { return { ok: false, error: { code: "unavailable" } }; } },
    attempt: ERP_SHADOW_MAX_ATTEMPTS,
    runId: "run_5",
    now: NOW,
  }), /dead letter could not be recorded/);
});

test("ambiguous or malformed mappings are refused", () => {
  assert.throws(() => validateErpMappings([...MAPPINGS, { ...MAPPINGS[0], erpItemCode: "YUB-OTHER" }]), /duplicate mapping/);
  assert.throws(() => validateErpMappings([...MAPPINGS, { ...MAPPINGS[0], sizeId: "5kg" }]), /mapped twice/);
  assert.throws(() => validateErpMappings([{ ...MAPPINGS[0], erpItemCode: "../Item" }]), /invalid ERP item code/);
});
