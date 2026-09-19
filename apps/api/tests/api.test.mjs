import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import {
  AllowlistAttributionPolicy,
  FixedClock,
  InMemoryMarketplaceListingRepository,
  InMemoryOutboundIntentRepository,
  InMemoryWhatsAppIntentRepository,
  SequentialIdGenerator,
} from "@yubie/application";
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
  verifiedBy: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const pausedListing = { ...activeListing, listingKey: "paused-listing", status: "paused" };

setAppContext({
  listings: new InMemoryMarketplaceListingRepository([activeListing, pausedListing]),
  whatsapp: new InMemoryWhatsAppIntentRepository(),
  outbound: new InMemoryOutboundIntentRepository(),
  allowlist: new DefaultRedirectAllowlistPolicy(),
  attribution: new AllowlistAttributionPolicy(),
  clock: new FixedClock("2026-01-01T00:00:00.000Z"),
  ids: new SequentialIdGenerator(),
  healthProbe: { async check() { return { ok: true, value: { ready: true } }; } },
  releaseSha: "test",
});

test("health endpoint exposes service status", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/healthz"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.service, "yubie-api");
});

test("readyz reports readiness", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/readyz"));
  assert.equal(response.status, 200);
});

test("purchase options returns active marketplace options", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/v1/products/yubie-flour/purchase-options"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.productId, "flour");
  assert.equal(payload.data.options.length, 1);
});

test("active marketplace redirect succeeds", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/go/shopee/yubie-flour-250?source=product_detail"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://shopee.co.id/yubie-flour-250");
});

test("paused listing redirect is rejected", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/go/shopee/paused-listing"));
  assert.equal(response.status, 404);
});

test("invalid channel is rejected", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/go/evil/yubie-flour-250"));
  assert.equal(response.status, 400);
});

test("open redirect via query url is not supported", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/go?url=https://evil.com"));
  assert.equal(response.status, 404);
});

test("whatsapp redirect unavailable without configured intent", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/go/whatsapp/flour-b2c"));
  assert.equal(response.status, 503);
});

test("catalog exposes public products without enabling coming-soon checkout", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/v1/catalog"));
  const payload = await response.json();
  assert.equal(payload.meta.count, 3);
  assert.equal(payload.data.find((product) => product.id === "shake").status, "coming-soon");
});

test("invalid newsletter submissions are rejected", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/v1/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", consent: true })
  }));
  assert.equal(response.status, 400);
});

test("waitlist accepts only scoped coming-soon product interest", async () => {
  const accepted = await handleRequest(new Request("https://api.yubiefood.id/v1/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hello@yubiefood.id", productId: "shake", consent: true })
  }));
  const rejected = await handleRequest(new Request("https://api.yubiefood.id/v1/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "hello@yubiefood.id", productId: "flour", consent: true })
  }));
  assert.equal(accepted.status, 202);
  assert.equal(rejected.status, 400);
});
