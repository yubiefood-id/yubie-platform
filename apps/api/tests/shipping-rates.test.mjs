import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

const NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN", "YUBIE_CHECKOUT_ADMISSION", "SHIPPING_EXECUTION_MODE", "SHIPPING_PROVIDER"];

function ratesRequest() {
  return new Request("https://api.yubiefood.com/v1/shipping/rates", {
    method: "POST",
    body: JSON.stringify({
      lines: [{ productId: "flour", sizeId: "250g", quantity: 1 }],
      delivery: { phone: "081200000000", address: "Jl. Contoh No. 1", city: "Bandung", postalCode: "40115" },
    }),
    headers: { "content-type": "application/json" },
  });
}

test("shipping rates route stays inert while SHIPPING_EXECUTION_MODE=disabled", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "preview";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    setAppContext(createAppContext());
    const response = await handleRequest(ratesRequest());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.shipping, { mode: "unavailable", reason: "provider_unconfigured" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setAppContext(createAppContext());
  }
});

test("shipping rates route rejects malformed bodies without side effects", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "preview";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    process.env.SHIPPING_EXECUTION_MODE = "shadow";
    process.env.SHIPPING_PROVIDER = "none";
    setAppContext(createAppContext());
    const bad = await handleRequest(new Request("https://api.yubiefood.com/v1/shipping/rates", {
      method: "POST",
      body: JSON.stringify({ lines: [], delivery: { phone: "1", address: "x", city: "B" } }),
      headers: { "content-type": "application/json" },
    }));
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, "INVALID_REQUEST");
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setAppContext(createAppContext());
  }
});
