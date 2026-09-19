import assert from "node:assert/strict";
import test from "node:test";
import {
  AllowlistAttributionPolicy,
  FixedClock,
  InMemoryMarketplaceListingRepository,
  InMemoryOutboundIntentRepository,
  InMemoryWhatsAppIntentRepository,
  SequentialIdGenerator,
  getPurchaseOptions,
  resolveMarketplaceRedirect,
  resolveWhatsAppRedirect,
} from "../dist/index.js";
import { DefaultRedirectAllowlistPolicy } from "@yubie/integrations";

const activeListing = {
  id: "lst-1",
  listingKey: "yubie-flour-250",
  marketplace: "shopee",
  shopKey: "yubie-official",
  productId: "flour",
  skuId: "250g",
  publicUrl: "https://shopee.co.id/yubie-flour-250",
  status: "active",
  verifiedAt: "2026-01-01T00:00:00.000Z",
  verifiedBy: "operator",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const pausedListing = { ...activeListing, listingKey: "paused", status: "paused" };

test("getPurchaseOptions returns only active listings", async () => {
  const listings = new InMemoryMarketplaceListingRepository([activeListing, pausedListing]);
  const whatsapp = new InMemoryWhatsAppIntentRepository();
  const result = await getPurchaseOptions("yubie-flour", listings, whatsapp, "req-1");
  assert.equal(result.ok, true);
  assert.equal(result.value.options.length, 1);
  assert.equal(result.value.options[0].kind, "marketplace");
});

test("resolveMarketplaceRedirect rejects paused listing", async () => {
  const listings = new InMemoryMarketplaceListingRepository([pausedListing]);
  const outbound = new InMemoryOutboundIntentRepository();
  const result = await resolveMarketplaceRedirect("shopee", "paused", {}, {
    listings,
    outbound,
    allowlist: new DefaultRedirectAllowlistPolicy(),
    attribution: new AllowlistAttributionPolicy(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    requestId: "req-2",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "not_found");
});

test("resolveMarketplaceRedirect succeeds for active allowlisted listing", async () => {
  const listings = new InMemoryMarketplaceListingRepository([activeListing]);
  const outbound = new InMemoryOutboundIntentRepository();
  const result = await resolveMarketplaceRedirect("shopee", "yubie-flour-250", { source: "product_detail" }, {
    listings,
    outbound,
    allowlist: new DefaultRedirectAllowlistPolicy(),
    attribution: new AllowlistAttributionPolicy(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    requestId: "req-3",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.destinationUrl, activeListing.publicUrl);
  assert.equal(outbound.events.length, 1);
});

test("resolveWhatsAppRedirect returns unavailable when not configured", async () => {
  const intents = new InMemoryWhatsAppIntentRepository();
  const outbound = new InMemoryOutboundIntentRepository();
  const result = await resolveWhatsAppRedirect("flour-b2c", {}, {
    intents,
    outbound,
    attribution: new AllowlistAttributionPolicy(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    ids: new SequentialIdGenerator(),
    requestId: "req-4",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unavailable");
});
