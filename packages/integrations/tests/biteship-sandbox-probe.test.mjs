import assert from "node:assert/strict";
import test from "node:test";
import { runBiteshipSandboxProbe, biteshipSandboxProbeDecision } from "../dist/index.js";

test("probe gating refuses anything but an explicit sandbox e2e request with a test key", () => {
  assert.deepEqual(biteshipSandboxProbeDecision({}), { run: false, reason: "not requested" });
  assert.equal(biteshipSandboxProbeDecision({ YUBIE_BITESHIP_SANDBOX_E2E: "1", BITESHIP_API_KEY: "biteship_live.x", BITESHIP_ENV: "production" }).run, false);
  assert.equal(biteshipSandboxProbeDecision({ YUBIE_BITESHIP_SANDBOX_E2E: "1", BITESHIP_API_KEY: "biteship_test.y", BITESHIP_ENV: "production" }).run, false);
  assert.equal(biteshipSandboxProbeDecision({ YUBIE_BITESHIP_SANDBOX_E2E: "1", BITESHIP_API_KEY: "biteship_test.y", BITESHIP_ENV: "sandbox" }).run, true);
});

test("probe drives rates -> pickup booking -> cancel with the live contract shapes", async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/rates/couriers")) {
      return { ok: true, status: 200, json: async () => ({ success: true, pricing: [
        { company: "jne", courier_service_code: "reg", price: 9000, available_collection_method: ["pickup"] },
        { company: "xx", courier_service_code: "inst", price: 1000, available_collection_method: ["drop_off"] },
      ] }) };
    }
    if (url.endsWith("/v1/orders")) {
      return { ok: true, status: 200, json: async () => ({ success: true, id: "bs_probe_1", status: "confirmed", courier: { waybill_id: "WYB-P", tracking_id: "TRK-P" } }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, status: "cancelled" }) };
  };
  const result = await runBiteshipSandboxProbe({ apiKey: "biteship_test.k", couriers: "jne", originPostalCode: 45363, destinationPostalCode: 40115, items: [{ name: "Tepung Yubie 250g", valueIdr: 35000, quantity: 2, weightGrams: 260 }], fetchFn });
  assert.ok(result.ok);
  assert.equal(result.value.ratesCount, 2);
  assert.equal(result.value.pickupCapableCount, 1);
  assert.deepEqual(result.value.cheapest, { company: "jne", serviceCode: "reg", priceIdr: 9000 });
  assert.equal(result.value.orderId, "bs_probe_1");
  assert.equal(result.value.cancelled, true);
  assert.equal(result.value.finalStatus, "cancelled");
  const orderBody = JSON.parse(calls[1].init.body);
  assert.equal(orderBody.courier_company, "jne");
  assert.equal(orderBody.courier_type, "reg", "courier_type is the live tier code, not a display label");
  assert.equal(orderBody.origin_collection_method, "pickup");
});
