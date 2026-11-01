import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

const NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN"];

test("token-scoped shipment tracking route stays gated without database shipping", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "preview";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    setAppContext(createAppContext());
    const response = await handleRequest(new Request("https://api.yubiefood.com/v1/checkouts/tok_unknown/shipment"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "SHIPPING_NOT_CONFIGURED");
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setAppContext(createAppContext());
  }
});
