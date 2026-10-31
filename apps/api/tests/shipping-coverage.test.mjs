import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

const NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN", "YUBIE_CHECKOUT_ADMISSION"];

async function getCoverage() {
  return handleRequest(new Request("https://api.yubiefood.com/v1/shipping/coverage"));
}

test("shipping coverage is a public PII-free read that degrades without a database", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "preview";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    setAppContext(createAppContext());

    // No DATABASE_URL: no shipping repository exists, so coverage must answer
    // an empty list — never a fabricated city, never stale data.
    const response = await getCoverage();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, { policies: [] });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setAppContext(undefined);
  }
});

test("shipping coverage stays available on non-commerce catalog launches", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.YUBIE_LAUNCH_PROFILE = "PUBLIC_CATALOG_NO_SALES";
    setAppContext(createAppContext());
    const response = await getCoverage();
    assert.notEqual(response.status, 503, "public catalog may still read coverage");
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setAppContext(undefined);
  }
});
