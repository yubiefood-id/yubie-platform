import assert from "node:assert/strict";
import test from "node:test";
import {
  FixedClock,
  InMemoryTransactionManager,
  SequentialIdGenerator,
  consumeCheckoutShippingQuote,
  consumeSubsidizedFreeQuote,
  courierOrderShipping,
  parcelizeCheckout,
  parcelsDigest,
  requestShippingRates,
  shippingCartHash,
  subsidizedOrderShipping,
  shippingDestinationHash,
} from "../dist/index.js";

const NOW = "2026-11-01T08:00:00.000Z";

/** Flour sachet + shake pack-7 are real sellable catalog SKUs. */
const FLOUR_SACHET = { productId: "flour", sizeId: "250g", quantity: 2 };
const PROFILES = new Map([
  ["YBF-250", { id: "p1", sku: "YBF-250", weightGrams: 260, lengthCm: 10, widthCm: 6, heightCm: 4, packaging: null, storageClass: "shelf_stable", handlingNotes: null, effectiveFrom: "2026-01-01T00:00:00.000Z", effectiveTo: null, version: 1, createdAt: NOW }],
]);

function fakeQuotes() {
  const rows = new Map();
  return {
    rows,
    async insert(record) { rows.set(record.id, { ...record }); return { ok: true, value: undefined }; },
    async listUsable({ principalKey, cartHash, destinationHash, now }) {
      return { ok: true, value: [...rows.values()].filter((row) => row.principalKey === principalKey && row.cartHash === cartHash && row.destinationHash === destinationHash && row.status === "quoted" && row.validUntil > now) };
    },
    async findById(id, now) {
      const row = rows.get(id);
      return { ok: true, value: row && row.status === "quoted" && row.validUntil > now ? row : null };
    },
    async consume(id, orderId, now) {
      const row = rows.get(id);
      if (!row || row.status !== "quoted" || row.validUntil <= now) return { ok: true, value: false };
      row.status = "consumed"; row.consumedAt = now; row.orderId = orderId;
      return { ok: true, value: true };
    },
  };
}

function fakeProvider(rates, calls = []) {
  return {
    calls,
    async getRates(query) { calls.push(query); return { ok: true, value: rates }; },
    async createBooking() { throw new Error("booking not part of rate quoting"); },
  };
}

function makeDeps({ provider = null, quotes = fakeQuotes(), origin = { id: "origin_1", postalCode: "45363", latitude: -6.9, longitude: 107.6 } } = {}) {
  const tx = new InMemoryTransactionManager({});
  return {
    provider,
    tx,
    quotes,
    origins: { async findActive() { return origin; } },
    profiles: { async findEffective() { return [...PROFILES.values()]; } },
    clock: new FixedClock(NOW),
    ids: new SequentialIdGenerator(),
  };
}

test("free city coverage always wins and never calls the provider", async () => {
  let authorizeCalls = 0;
  const deps = makeDeps({ provider: fakeProvider([]) });
  deps.tx.run = async (operation, work) => work({
    shipping: { async authorize(city, now) { authorizeCalls += 1; return city === "Kabupaten Bogor" ? { policy: "free_promotional", amount: 0, reason: "approved" } : null; } },
  });
  const result = await requestShippingRates({ principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Kabupaten Bogor", postalCode: "16110" } }, deps);
  assert.deepEqual(result.value, { mode: "free_promotional" });
  assert.equal(authorizeCalls, 1);
});

test("rates require a postal code and an admitted provider", async () => {
  const deps = makeDeps({ provider: fakeProvider([]) });
  deps.tx.run = async (operation, work) => work({ shipping: { async authorize() { return null; } } });
  const noPostal = await requestShippingRates({ principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Bandung", postalCode: "" } }, deps);
  assert.deepEqual(noPostal.value, { mode: "unavailable", reason: "missing_postal_code" });
  const noProvider = await requestShippingRates({ principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Bandung", postalCode: "40115" } }, makeDeps({ provider: null }));
  assert.deepEqual(noProvider.value, { mode: "unavailable", reason: "provider_unconfigured" });
});

test("perishable SKUs are blocked from courier dispatch until transit handling is approved", async () => {
  const perishable = new Map([["YBF-250", { ...PROFILES.get("YBF-250"), storageClass: "frozen" }]]);
  const deps = makeDeps({ provider: fakeProvider([]) });
  deps.tx.run = async (operation, work) => work({ shipping: { async authorize() { return null; } } });
  deps.profiles = { async findEffective() { return [...perishable.values()]; } };
  const result = await requestShippingRates({ principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Bandung", postalCode: "40115" } }, deps);
  assert.deepEqual(result.value, { mode: "unavailable", reason: "perishable_unapproved" });
});

test("rates keep only pickup-capable services, cap options and persist server-owned quotes", async () => {
  const quotes = fakeQuotes();
  const rates = [
    { courierCompany: "JNE", courierName: "JNE", courierServiceCode: "jne_reg", courierServiceName: "Reguler", serviceType: "standard", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: true, availableForInstantWaybill: false, priceIdr: 20000, shippingFeeIdr: 20000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: "2 - 3 days" },
    { courierCompany: "SiCepat", courierName: null, courierServiceCode: "sicepat_best", courierServiceName: "Best", serviceType: "standard", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 18000, shippingFeeIdr: 18000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: "1 - 2 days" },
    { courierCompany: "Gojek", courierName: null, courierServiceCode: "gojek_instant", courierServiceName: "Instant", serviceType: "instant", deliveryType: "now", availableForPickup: false, availableForInsurance: false, availableForInstantWaybill: true, priceIdr: 28000, shippingFeeIdr: 28000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: "1 - 3 hours" },
  ];
  const provider = fakeProvider(rates);
  const deps = makeDeps({ provider, quotes });
  deps.tx.run = async (operation, work) => work({ shipping: { async authorize() { return null; } }, shippingQuotes: quotes });
  const result = await requestShippingRates({ principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Bandung", postalCode: "40115" } }, deps);
  assert.equal(result.value.mode, "courier");
  assert.deepEqual(result.value.options.map((option) => option.courierServiceCode), ["sicepat_best", "jne_reg"], "drop-off-only instant service filtered out, cheapest first");
  assert.equal(quotes.rows.size, 2);
  const request = provider.calls[0];
  assert.equal(request.origin.postalCode, "45363");
  assert.equal(request.destination.postalCode, "40115");
  assert.equal(request.items[0].weightGrams, 260);
  assert.equal(request.items[0].category, "food_and_drink");
});

test("still-valid quotes are reused without a second provider call", async () => {
  const quotes = fakeQuotes();
  const provider = fakeProvider([
    { courierCompany: "JNE", courierName: null, courierServiceCode: "jne_reg", courierServiceName: "Reguler", serviceType: "standard", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 20000, shippingFeeIdr: 20000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: null },
  ]);
  const deps = makeDeps({ provider, quotes });
  deps.tx.run = async (operation, work) => work({ shipping: { async authorize() { return null; } }, shippingQuotes: quotes });
  const input = { principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Bandung", postalCode: "40115" } };
  await requestShippingRates(input, deps);
  await requestShippingRates(input, deps);
  assert.equal(provider.calls.length, 1, "second request reuses the stored quotes");
});

test("hashes bind cart and routing destination only", () => {
  assert.equal(shippingCartHash([FLOUR_SACHET]), shippingCartHash([{ ...FLOUR_SACHET, quantity: 1 }, { productId: "flour", sizeId: "250g", quantity: 1 }]));
  assert.notEqual(shippingCartHash([FLOUR_SACHET]), shippingCartHash([{ ...FLOUR_SACHET, quantity: 3 }]));
  const hash = shippingDestinationHash({ address: "Jl. A 1", city: "Bandung", postalCode: "40115" });
  assert.equal(hash, shippingDestinationHash({ address: "Jl. A 1 ", city: "bandung", postalCode: "40115" }));
  assert.notEqual(hash, shippingDestinationHash({ address: "Jl. B 2", city: "Bandung", postalCode: "40115" }));
  assert.equal(parcelsDigest(parcelizeCheckout([FLOUR_SACHET], PROFILES).items), parcelsDigest(parcelizeCheckout([FLOUR_SACHET], PROFILES).items));
});

test("parcelization reports missing profiles instead of guessing weights", () => {
  const complete = parcelizeCheckout([FLOUR_SACHET], PROFILES);
  assert.equal(complete.complete, true);
  assert.equal(complete.perishable, false);
  assert.equal(complete.items[0].sku, "YBF-250");
  const empty = parcelizeCheckout([FLOUR_SACHET], new Map());
  assert.equal(empty.complete, false);
  assert.equal(empty.items.length, 0);
});

test("quote consumption validates principal, cart and destination binding exactly once", async () => {
  const quotes = fakeQuotes();
  const record = {
    id: "sq_1", principalKey: "guest:" + "a".repeat(64), cartHash: shippingCartHash([FLOUR_SACHET]),
    destinationHash: shippingDestinationHash({ address: "Jl. A 1", city: "Bandung", postalCode: "40115" }),
    originId: "origin_1", parcelsDigest: "d".repeat(64), courierCompany: "JNE", courierServiceCode: "jne_reg",
    courierServiceName: "Reguler", serviceType: "standard", deliveryType: "scheduled", offeredAmountIdr: 20000,
    providerAmountIdr: 20000, subsidyAmountIdr: 0, taxAmountIdr: 0, taxPolicyVersion: "non-pkp-v1", currency: "IDR",
    status: "quoted", validUntil: "2026-11-01T08:10:00.000Z", createdAt: NOW, consumedAt: null, orderId: null,
  };
  await quotes.insert(record);
  const repos = { shippingQuotes: quotes };
  const base = { quoteId: "sq_1", principalKey: record.principalKey, cartHash: record.cartHash, destinationHash: record.destinationHash, orderId: "ord_1", now: NOW };

  const consumed = await consumeCheckoutShippingQuote(repos, base);
  assert.equal(consumed.id, "sq_1");
  const shipping = courierOrderShipping(consumed);
  assert.deepEqual(
    { policy: shipping.policy, amount: shipping.amount, quoteId: shipping.quoteId, courierServiceCode: shipping.courierServiceCode },
    { policy: "courier", amount: 20000, quoteId: "sq_1", courierServiceCode: "jne_reg" },
  );
  // Second consumption (duplicate callback / replay) refuses.
  assert.equal(await consumeCheckoutShippingQuote(repos, base), null);
  // A different principal, cart, or an expired quote can never ride this quote.
  await quotes.insert({ ...record, id: "sq_2", cartHash: shippingCartHash([{ ...FLOUR_SACHET, quantity: 5 }]), status: "quoted", consumedAt: null, orderId: null });
  assert.equal(await consumeCheckoutShippingQuote(repos, { ...base, quoteId: "sq_2", principalKey: "guest:" + "b".repeat(64) }), null, "principal mismatch rejected");
  assert.equal(await consumeCheckoutShippingQuote(repos, { ...base, quoteId: "sq_2" }), null, "cart mismatch rejected");
  assert.equal(await consumeCheckoutShippingQuote(repos, { ...base, quoteId: "sq_2", now: "2026-11-01T08:11:00.000Z" }), null, "expired quote rejected");
});

test("P1 instant services are never offered (no destination coordinates persisted)", async () => {
  const quotes = fakeQuotes();
  const rates = [
    { courierCompany: "Gojek", courierName: null, courierServiceCode: "gojek_instant", courierServiceName: "Instant", serviceType: "instant", deliveryType: "now", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: true, priceIdr: 18000, shippingFeeIdr: 18000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: "1 - 3 hours" },
    { courierCompany: "JNE", courierName: null, courierServiceCode: "jne_reg", courierServiceName: "Reguler", serviceType: "standard", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 20000, shippingFeeIdr: 20000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: null },
  ];
  const provider = fakeProvider(rates);
  const deps = makeDeps({ provider, quotes });
  deps.tx.run = async (operation, work) => work({ shipping: { async authorize() { return null; } }, shippingQuotes: quotes });
  const result = await requestShippingRates({ principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Bandung", postalCode: "40115" } }, deps);
  assert.deepEqual(result.value.options.map((option) => option.courierServiceCode), ["jne_reg"], "instant excluded: unbookable without coordinates");
});

test("P0-C subsidized free coverage mints a Rp0 quote with the compliant cheapest courier", async () => {
  const quotes = fakeQuotes();
  const rates = [
    { courierCompany: "GoSend", courierName: null, courierServiceCode: "gosend_instant", courierServiceName: "Instant", serviceType: "instant", deliveryType: "now", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: true, priceIdr: 15000, shippingFeeIdr: 15000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: null },
    { courierCompany: "Expensive", courierName: null, courierServiceCode: "exp_same", courierServiceName: "Same Day", serviceType: "same_day", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 60000, shippingFeeIdr: 60000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: null },
    { courierCompany: "SiCepat", courierName: null, courierServiceCode: "sicepat_best", courierServiceName: "Best", serviceType: "standard", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 18000, shippingFeeIdr: 18000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: "1 - 2 days" },
    { courierCompany: "DropOffOnly", courierName: null, courierServiceCode: "drop_reg", courierServiceName: "Reg", serviceType: "standard", deliveryType: "scheduled", availableForPickup: false, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 9000, shippingFeeIdr: 9000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: null },
  ];
  const provider = fakeProvider(rates);
  const deps = makeDeps({ provider, quotes });
  deps.tx.run = async (operation, work) => work({ shipping: { async authorize(city) { return city === "Kabupaten Bogor" ? { policy: "free_promotional", amount: 0, reason: "approved" } : null; } }, shippingQuotes: quotes });
  const input = { principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Kabupaten Bogor", postalCode: "16110" }, subsidizedFree: { maxSubsidyIdr: 50000 } };
  const result = await requestShippingRates(input, deps);
  assert.equal(result.value.mode, "free_promotional_subsidized");
  assert.equal(result.value.providerAmountIdr, 18000, "cheapest COMPLIANT: instant excluded, drop-off excluded, over-cap excluded");
  assert.equal(result.value.subsidyAmountIdr, 18000);
  const stored = [...quotes.rows.values()][0];
  assert.equal(stored.offeredAmountIdr, 0, "customer charge Rp0");
  assert.equal(stored.providerAmountIdr, 18000);
  assert.equal(stored.subsidyAmountIdr, 18000);
  assert.equal(stored.taxPolicyVersion, "free-subsidy-v1");
  // Subsequent request reuses the subsidized row without another provider call.
  await requestShippingRates(input, deps);
  assert.equal(provider.calls.length, 1);
  // Subsidized snapshot stays Rp0 for the customer with courier identity.
  const shipping = subsidizedOrderShipping(stored);
  assert.deepEqual({ policy: shipping.policy, amount: shipping.amount, quoteId: shipping.quoteId, subsidyAmountIdr: shipping.subsidyAmountIdr }, { policy: "free_promotional", amount: 0, quoteId: stored.id, subsidyAmountIdr: 18000 });
});

test("P0-C guards: subsidy off / over cap / no compliant service degrade to plain free", async () => {
  const rates = [
    { courierCompany: "JNE", courierName: null, courierServiceCode: "jne_reg", courierServiceName: "Reguler", serviceType: "standard", deliveryType: "scheduled", availableForPickup: true, availableForInsurance: false, availableForInstantWaybill: false, priceIdr: 20000, shippingFeeIdr: 20000, insuranceFeeIdr: 0, currency: "IDR", durationDescription: null },
  ];
  const deps0 = makeDeps({ provider: fakeProvider(rates), quotes: fakeQuotes() });
  deps0.tx.run = async (operation, work) => work({ shipping: { async authorize() { return { policy: "free_promotional", amount: 0, reason: "ok" }; } }, shippingQuotes: deps0.quotes });
  const base = { principalKey: "guest:" + "a".repeat(64), lines: [FLOUR_SACHET], delivery: { address: "Jl. A 1", city: "Kabupaten Bogor", postalCode: "16110" } };
  // Lever unset -> plain free.
  assert.deepEqual((await requestShippingRates(base, deps0)).value, { mode: "free_promotional" });
  // Cap below every compliant price -> plain free, nothing persisted.
  const deps1 = makeDeps({ provider: fakeProvider(rates), quotes: fakeQuotes() });
  deps1.tx.run = async (operation, work) => work({ shipping: { async authorize() { return { policy: "free_promotional", amount: 0, reason: "ok" }; } }, shippingQuotes: deps1.quotes });
  assert.deepEqual((await requestShippingRates({ ...base, subsidizedFree: { maxSubsidyIdr: 10000 } }, deps1)).value, { mode: "free_promotional" });
  assert.equal(deps1.quotes.rows.size, 0);
  // TX1 fallback: consumeSubsidizedFreeQuote returns null with no subsidized row.
  assert.equal(await consumeSubsidizedFreeQuote({ shippingQuotes: deps1.quotes }, { principalKey: base.principalKey, cartHash: "c".repeat(64), destinationHash: "d".repeat(64), orderId: "ord_x", now: NOW }), null);
});
