import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../dist/index.js";

test("health endpoint exposes service status", async () => {
  const response = await handleRequest(new Request("https://api.yubiefood.id/healthz"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "yubie-api", version: "v1" });
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
