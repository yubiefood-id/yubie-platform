import assert from "node:assert/strict";
import test from "node:test";
import {
  BiteshipShippingProvider,
  createShippingProvider,
  mapBiteshipStatus,
  parseBiteshipWebhook,
  verifyBiteshipWebhookSecret,
} from "../dist/index.js";

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => next.body,
    };
  };
  fn.calls = calls;
  return fn;
}

const timeoutError = () => {
  const error = new Error("aborted");
  error.name = "TimeoutError";
  return error;
};

function provider(fetchFn) {
  return new BiteshipShippingProvider({ apiKey: "test_server_key", env: "sandbox", fetchFn });
}

const RATES_BODY = {
  success: true,
  object: "pricing",
  pricing: [
    {
      company: "JNE",
      courier_name: "JNE Express",
      courier_service_name: "Layanan Reguler",
      courier_service_code: "jne_reg",
      service_type: "standard",
      available_collection_method: ["pickup", "drop_off"],
      available_for_insurance: true,
      available_for_instant_waybill_id: false,
      currency: "IDR",
      duration: "2 - 3 days",
      shipping_fee: 21000,
      shipping_fee_discount: 1000,
      price: 20000,
      type: "reg",
    },
    {
      company: "Gojek",
      courier_name: "GoSend",
      courier_service_name: "Instant",
      courier_service_code: "gojek_instant",
      service_type: "instant",
      available_collection_method: ["drop_off"],
      available_for_insurance: false,
      available_for_instant_waybill_id: true,
      currency: "IDR",
      duration: "1 - 3 hours",
      shipping_fee: 28000,
      price: 28000,
      type: "instant",
    },
  ],
};

const ORDER_BODY = {
  success: true,
  object: "order",
  id: "5dd599ebdefcd4158eb8470b",
  reference_id: "ybshp-co_12_ab-p0-g1",
  price: 20000,
  currency: "IDR",
  status: "confirmed",
  courier: { tracking_id: "BSL-828282", waybill_id: "WYB-1112223333443", company: "JNE", type: "reg", link: "https://track.example/1" },
};

const RATE_ITEMS = [
  { name: "Tepung Yubie 250g", category: "food_and_drink", sku: "YBF-250", valueIdr: 39000, quantity: 2, weightGrams: 260, lengthCm: 10, widthCm: 6, heightCm: 4 },
];

test("getRates maps provider pricing onto neutral pickup-aware rates", async () => {
  const fetchFn = fakeFetch([{ body: RATES_BODY }]);
  const result = await provider(fetchFn).getRates({
    origin: { postalCode: "16143" },
    destination: { latitude: -6.3, longitude: 107.3 },
    couriers: "jne:reg,gojek:instant",
    insuranceAmountIdr: 50000,
    items: RATE_ITEMS,
  });
  assert.ok(result.ok);
  assert.equal(result.value.length, 2);
  const jne = result.value.find((rate) => rate.courierServiceCode === "jne_reg");
  assert.equal(jne.availableForPickup, true);
  assert.equal(jne.priceIdr, 20000);
  assert.equal(jne.deliveryType, "scheduled");
  const gojek = result.value.find((rate) => rate.courierServiceCode === "gojek_instant");
  assert.equal(gojek.availableForPickup, false, "drop-off-only services are flagged, not silently offered");
  assert.equal(gojek.deliveryType, "now");
  // Request shape: postal origin, coordinate destination, grams/dims items.
  const body = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(body.origin_postal_code, "16143");
  assert.equal(body.destination_latitude, -6.3);
  assert.equal(body.couriers, "jne:reg,gojek:instant");
  assert.equal(body.courier_insurance, 50000);
  assert.equal(body.items[0].weight, 260);
  assert.equal(body.items[0].category, "food_and_drink");
  assert.equal(fetchFn.calls[0].init.headers.authorization, "Bearer test_server_key");
  assert.ok(fetchFn.calls[0].url.startsWith("https://api.biteship.com/v1/rates/couriers"));
});

test("createBooking pins pickup collection, coordinates and reference identity", async () => {
  const fetchFn = fakeFetch([{ body: ORDER_BODY }]);
  const result = await provider(fetchFn).createBooking({
    referenceId: "ybshp-co_12_ab-p0-g1",
    origin: { contactName: "Owner", contactPhone: "0812", address: "Jl. Gudang 1", postalCode: "16143", latitude: -6.2, longitude: 107.5 },
    destination: { contactName: "Customer", contactPhone: "0813", address: "Jl. Rumah 2", latitude: -6.3, longitude: 107.3 },
    courierCompany: "JNE",
    courierServiceCode: "jne_reg",
    courierType: "reg",
    deliveryType: "now",
    items: RATE_ITEMS,
    metadata: { orderId: "ord_1" },
  });
  assert.ok(result.ok);
  assert.equal(result.value.providerOrderId, "5dd599ebdefcd4158eb8470b");
  assert.equal(result.value.waybillId, "WYB-1112223333443");
  assert.equal(result.value.rawStatus, "confirmed");
  assert.equal(result.value.recoveredViaReferenceConflict, undefined);
  const body = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(body.origin_collection_method, "pickup");
  assert.equal(body.origin_address, "Jl. Gudang 1");
  assert.equal(body.destination_address, "Jl. Rumah 2");
  assert.deepEqual(body.origin_coordinate, { latitude: -6.2, longitude: 107.5 });
  assert.equal(body.reference_id, "ybshp-co_12_ab-p0-g1");
  assert.equal(body.delivery_type, "now");
  assert.equal(body.items[0].value, 39000);
});

test("a duplicate reference create recovers the existing provider order instead of failing", async () => {
  const fetchFn = fakeFetch([{
    status: 400,
    body: { success: false, error: { code: "40002060", message: "Reference id has already been used before", details: { order_id: "5ddexisting", waybill_id: "WYB-OLD", reference_id: "ybshp-co_12_ab-p0-g1" } } },
  }]);
  const result = await provider(fetchFn).createBooking({
    referenceId: "ybshp-co_12_ab-p0-g1",
    origin: { contactName: "Owner", contactPhone: "0812", address: "Jl. Gudang 1" },
    destination: { contactName: "Customer", contactPhone: "0813", address: "Jl. Rumah 2" },
    courierCompany: "JNE",
    courierServiceCode: "jne_reg",
    courierType: "reg",
    deliveryType: "scheduled",
    scheduledDate: "2026-11-05",
    scheduledTime: "10:00",
    items: RATE_ITEMS,
  });
  assert.ok(result.ok, "reference conflict is a recovered booking, not an error");
  assert.equal(result.value.recoveredViaReferenceConflict, true);
  assert.equal(result.value.providerOrderId, "5ddexisting");
  assert.equal(result.value.waybillId, "WYB-OLD");
});

test("scheduled bookings require date and time; provider 4xx stays definitive", async () => {
  const fetchFn = fakeFetch([]);
  const missing = await provider(fetchFn).createBooking({
    referenceId: "ybshp-x-p0-g1",
    origin: { contactName: "Owner", contactPhone: "0812", address: "Jl. Gudang 1" },
    destination: { contactName: "Customer", contactPhone: "0813", address: "Jl. Rumah 2" },
    courierCompany: "JNE",
    courierServiceCode: "jne_reg",
    courierType: "reg",
    deliveryType: "scheduled",
    items: RATE_ITEMS,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "validation");
  const refused = await provider(fakeFetch([{ status: 400, body: { success: false, error: { code: "40002100", message: "courier not found" } } }])).createBooking({
    referenceId: "ybshp-x-p0-g2",
    origin: { contactName: "Owner", contactPhone: "0812", address: "Jl. Gudang 1" },
    destination: { contactName: "Customer", contactPhone: "0813", address: "Jl. Rumah 2" },
    courierCompany: "Nope",
    courierServiceCode: "nope",
    courierType: "reg",
    deliveryType: "now",
    items: RATE_ITEMS,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, "validation");
  assert.equal(refused.error.retryable, false);
});

test("timeout and 5xx are ambiguous outcomes, never retryable creates", async () => {
  const timedOut = await provider(fakeFetch([timeoutError()])).createBooking({
    referenceId: "ybshp-t-p0-g1",
    origin: { contactName: "Owner", contactPhone: "0812", address: "Jl. Gudang 1" },
    destination: { contactName: "Customer", contactPhone: "0813", address: "Jl. Rumah 2" },
    courierCompany: "JNE", courierServiceCode: "jne_reg", courierType: "reg", deliveryType: "now",
    items: RATE_ITEMS,
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error.code, "timeout");
  assert.equal(timedOut.error.retryable, true);
  const serverError = await provider(fakeFetch([{ status: 500, body: { success: false } }])).getRates({
    origin: { postalCode: "16143" }, destination: { postalCode: "40115" }, items: RATE_ITEMS,
  });
  assert.equal(serverError.ok, false);
  assert.equal(serverError.error.code, "unavailable");
  assert.equal(serverError.error.retryable, true);
});

test("getOrder, cancelOrder and getTracking map provider responses", async () => {
  const fetchFn = fakeFetch([
    { body: ORDER_BODY },
    { body: { success: true, id: "5dd599ebdefcd4158eb8470b", status: "cancelled" } },
    { body: { success: true, waybill_id: "WYB-1112223333443", history: [
      { id: "h1", status: "PICKED_AT_ORIGIN", updated_at: "2026-11-02T02:00:00Z", note: "Picked", city: "Jakarta" },
      { id: "h2", status: "DELIVERED", updated_at: "2026-11-03T02:00:00Z" },
    ] } },
  ]);
  const p = provider(fetchFn);
  const order = await p.getOrder("5dd599ebdefcd4158eb8470b");
  assert.ok(order.ok && order.value);
  assert.equal(order.value.courierCompany, "JNE");
  assert.equal(fetchFn.calls[0].init.method, "GET");
  const cancel = await p.cancelOrder("5dd599ebdefcd4158eb8470b");
  assert.ok(cancel.ok && cancel.value.accepted);
  assert.ok(fetchFn.calls[1].url.endsWith("/v1/orders/5dd599ebdefcd4158eb8470b/cancel"));
  const tracking = await p.getTracking("JNE", "WYB-1112223333443");
  assert.ok(tracking.ok && tracking.value);
  assert.equal(tracking.value.history.length, 2);
  assert.equal(tracking.value.history[0].city, "Jakarta");
});

test("provider statuses map to domain shipment statuses without guessing", () => {
  assert.equal(mapBiteshipStatus("confirmed"), "booked");
  assert.equal(mapBiteshipStatus("being_picked_up"), "pickup_pending");
  assert.equal(mapBiteshipStatus("picked"), "picked");
  assert.equal(mapBiteshipStatus("delivered"), "delivered");
  assert.equal(mapBiteshipStatus("cancelled_by_shipper"), "cancelled");
  assert.equal(mapBiteshipStatus("lost"), "held");
  assert.equal(mapBiteshipStatus("returned"), "returned");
  assert.equal(mapBiteshipStatus("pending"), null);
  assert.equal(mapBiteshipStatus("draft"), null);
  assert.equal(mapBiteshipStatus("something_new"), null);
});

test("webhook secrets compare constant-time and reject mismatches", () => {
  assert.equal(verifyBiteshipWebhookSecret("s3cret-value", "s3cret-value"), true);
  assert.equal(verifyBiteshipWebhookSecret(undefined, "s3cret-value"), false);
  assert.equal(verifyBiteshipWebhookSecret("wrong", "s3cret-value"), false);
  assert.equal(verifyBiteshipWebhookSecret("s3cret-value-longer", "s3cret-value"), false);
  assert.equal(verifyBiteshipWebhookSecret("", ""), false);
});

test("webhook payloads parse for all three events, tolerating the documented fee misspelling", () => {
  const status = parseBiteshipWebhook({ event: "order.status", courier_waybill_id: "WYB-1", courier_company: "JNE", courier_type: "REG", order_id: "5dd1", order_price: 20000, status: "picked" });
  assert.deepEqual(
    { event: status.event, orderId: status.orderId, status: status.status, priceIdr: status.priceIdr, waybillId: status.waybillId },
    { event: "order.status", orderId: "5dd1", status: "picked", priceIdr: 20000, waybillId: "WYB-1" },
  );
  const price = parseBiteshipWebhook({ event: "order.price", order_id: "5dd2", price: 25000, shippment_fee: 24000, proof_of_delivery_fee: 2000, status: "picked" });
  assert.equal(price.shippingFeeIdr, 24000, "documented 'shippment_fee' spelling is accepted");
  assert.equal(price.proofOfDeliveryFeeIdr, 2000);
  const waybill = parseBiteshipWebhook({ event: "order.waybill_id", order_id: "5dd3", courier_tracking_id: "TRK-9", courier_waybill_id: "WYB-2", status: "confirmed" });
  assert.equal(waybill.trackingId, "TRK-9");
  assert.equal(parseBiteshipWebhook({ event: "order.exploded" }), null);
  assert.equal(parseBiteshipWebhook("not-an-object"), null);
  assert.equal(parseBiteshipWebhook({ event: "order.price", order_id: 42 }), null);
});

test("factory stays inert without admission and fails closed on half-configuration", () => {
  assert.equal(createShippingProvider({}), null);
  assert.equal(createShippingProvider({ SHIPPING_PROVIDER: "none" }), null);
  assert.throws(() => createShippingProvider({ SHIPPING_PROVIDER: "kiriminaja" }), /Unknown SHIPPING_PROVIDER/);
  assert.throws(() => createShippingProvider({ SHIPPING_PROVIDER: "biteship" }), /BITESHIP_API_KEY/);
  assert.throws(() => createShippingProvider({ SHIPPING_PROVIDER: "biteship", BITESHIP_API_KEY: "k" }), /BITESHIP_ENV/);
  assert.throws(
    () => createShippingProvider({ SHIPPING_PROVIDER: "biteship", BITESHIP_API_KEY: "k", BITESHIP_ENV: "sandbox", BITESHIP_API_BASE_URL: "https://evil.example" }),
    /must be https:\/\/api.biteship.com/,
  );
  const admitted = createShippingProvider({ SHIPPING_PROVIDER: "biteship", BITESHIP_API_KEY: "k", BITESHIP_ENV: "sandbox" });
  assert.ok(admitted instanceof BiteshipShippingProvider);
});

test("adapter construction refuses a non-pinned origin", () => {
  assert.throws(
    () => new BiteshipShippingProvider({ apiKey: "k", env: "sandbox", apiBaseUrl: "https://api.biteship.com.evil.io" }),
    /refuses an API origin/,
  );
});
