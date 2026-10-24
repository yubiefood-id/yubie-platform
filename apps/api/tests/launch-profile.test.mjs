import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

test("catalog launch policy rejects customer mutation and session routes before composition work", async () => {
  const names = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN"];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "disabled";
    setAppContext(createAppContext());
    for (const profile of [undefined, "PUBLIC_CATALOG_NO_SALES", "MARKETPLACE_MSP"]) {
      if (profile) process.env.YUBIE_LAUNCH_PROFILE = profile;
      else delete process.env.YUBIE_LAUNCH_PROFILE;
      for (const [path, method] of [["/v1/auth/session", "GET"], ["/v1/auth/google", "POST"], ["/v1/checkouts/session", "GET"], ["/v1/checkouts", "POST"], ["/v1/checkouts/synthetic", "GET"], ["/v1/account/orders", "GET"], ["/v1/newsletter", "POST"], ["/v1/b2b-leads", "POST"], ["/v1/waitlist", "POST"]]) {
        const response = await handleRequest(new Request(`https://api.yubiefood.com${path}`, { method, ...(method === "POST" ? { body: "{}", headers: { "content-type": "application/json" } } : {}) }));
        assert.equal(response.status, 503, `${profile ?? "default"} ${path}`);
        assert.equal((await response.json()).code, "FEATURE_DISABLED");
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("set-cookie"), null);
      }
    }
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("DIRECT_COMMERCE_PRODUCTION opens the customer gate like the sandbox profile", async () => {
  const names = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN"];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "disabled";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_PRODUCTION";
    setAppContext(createAppContext());
    // With COMMERCE_PROVIDER=disabled the checkout route is skipped downstream,
    // but the launch gate itself must no longer answer FEATURE_DISABLED.
    const response = await handleRequest(new Request("https://api.yubiefood.com/v1/checkouts", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    const body = await response.json();
    assert.notEqual(body.code, "FEATURE_DISABLED");
    assert.notEqual(response.status, 503);
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
