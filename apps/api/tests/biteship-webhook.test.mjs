import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

const NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN", "BITESHIP_WEBHOOK_SECRET", "BITESHIP_WEBHOOK_SECRET_HEADER"];

function webhook(body, headers = {}) {
  return new Request("https://api.yubiefood.com/v1/webhooks/biteship", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("biteship webhook verifies the static secret header before any durable effect", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "preview";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    process.env.BITESHIP_WEBHOOK_SECRET = "test_webhook_secret";
    setAppContext(createAppContext());

    // Unknown/unparseable events acknowledge 202 — never a retry storm.
    const ignored = await handleRequest(webhook({ event: "order.exploded" }));
    assert.equal(ignored.status, 202);
    assert.equal((await ignored.json()).result, "ignored");

    // Wrong or missing secret: 401, no inbox write (in-memory ctx has none anyway).
    const wrong = await handleRequest(webhook({ event: "order.status", order_id: "bs_1", status: "picked" }, { "x-biteship-secret": "wrong" }));
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, "INVALID_SIGNATURE");
    const missing = await handleRequest(webhook({ event: "order.status", order_id: "bs_1", status: "picked" }));
    assert.equal(missing.status, 401);

    // Correct secret but no durable inbox configured (in-memory deployment):
    // 503 so the provider redelivers; nothing applied.
    const noStorage = await handleRequest(webhook({ event: "order.status", order_id: "bs_1", status: "picked" }, { "x-biteship-secret": "test_webhook_secret" }));
    assert.equal(noStorage.status, 503);
    assert.equal((await noStorage.json()).code, "WEBHOOK_NOT_CONFIGURED");

    // A configured custom header name is honored.
    process.env.BITESHIP_WEBHOOK_SECRET_HEADER = "x-custom-secret";
    setAppContext(createAppContext());
    const customHeader = await handleRequest(webhook({ event: "order.status", order_id: "bs_1", status: "picked" }, { "x-custom-secret": "test_webhook_secret" }));
    assert.equal(customHeader.status, 503, "custom header accepted up to the storage gate");
    const customWrong = await handleRequest(webhook({ event: "order.status", order_id: "bs_1", status: "picked" }, { "x-custom-secret": "nope" }));
    assert.equal(customWrong.status, 401);
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setAppContext(createAppContext());
  }
});
