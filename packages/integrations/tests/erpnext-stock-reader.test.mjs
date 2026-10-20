import assert from "node:assert/strict";
import test from "node:test";
import { ErpNextShadowClient, ErpNextStockReader } from "../dist/index.js";

function mockFrappe(handler) {
  const calls = [];
  const client = new ErpNextShadowClient({
    baseUrl: "https://erp.example.test",
    apiKey: "shadow-key",
    apiSecret: "shadow-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: new URL(String(url)), method: init.method });
      return handler(new URL(String(url)));
    },
  });
  return { reader: new ErpNextStockReader(client), calls };
}

test("reads Bin quantities with GET, item and warehouse filters", async () => {
  const { reader, calls } = mockFrappe(() => new Response(JSON.stringify({
    data: [{ item_code: "YUB-FLOUR-250", actual_qty: 12 }, { item_code: "YUB-FLOUR-1000", actual_qty: 0 }],
  }), { status: 200 }));
  const result = await reader.readReleasedStock(["YUB-FLOUR-250", "YUB-FLOUR-1000"], "Released - YUB");
  assert.deepEqual(result, { ok: true, value: [{ sku: "YUB-FLOUR-250", quantity: 12 }, { sku: "YUB-FLOUR-1000", quantity: 0 }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url.pathname, "/api/resource/Bin");
  assert.deepEqual(JSON.parse(calls[0].url.searchParams.get("filters")), [
    ["item_code", "in", ["YUB-FLOUR-250", "YUB-FLOUR-1000"]],
    ["warehouse", "=", "Released - YUB"],
  ]);
});

test("fractional, negative, or malformed quantities are invalid, never rounded", async () => {
  for (const data of [
    [{ item_code: "A", actual_qty: 1.5 }],
    [{ item_code: "A", actual_qty: -1 }],
    [{ item_code: "A" }],
    "not-an-array",
  ]) {
    const { reader } = mockFrappe(() => new Response(JSON.stringify({ data }), { status: 200 }));
    assert.deepEqual(await reader.readReleasedStock(["A"], "Released - YUB"), { ok: false, code: "invalid_response" });
  }
});

test("ERP errors are unavailable and an empty mapping makes no call", async () => {
  const { reader, calls } = mockFrappe(() => new Response("{}", { status: 502 }));
  assert.deepEqual(await reader.readReleasedStock(["A"], "Released - YUB"), { ok: false, code: "unavailable" });
  assert.deepEqual(await reader.readReleasedStock([], "Released - YUB"), { ok: true, value: [] });
  assert.equal(calls.length, 1);
});
