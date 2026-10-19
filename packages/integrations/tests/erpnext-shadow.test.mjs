import assert from "node:assert/strict";
import test from "node:test";
import { ErpNextShadowClient } from "../dist/index.js";

test("the shadow client reads only an allowlisted HTTPS resource and refuses writes", async () => {
  const calls = [];
  const client = new ErpNextShadowClient({
    baseUrl: "https://erp.example.test",
    apiKey: "shadow-key",
    apiSecret: "shadow-token",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method, authorization: init.headers.Authorization });
      return new Response(JSON.stringify({ data: [{ item_code: "flour-250" }] }), { status: 200 });
    },
  });

  const read = await client.read("/api/resource/Item?fields=[\"item_code\"]");
  assert.equal(read.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url.startsWith("https://erp.example.test/api/resource/"), true);
  assert.equal(calls[0].authorization.startsWith("token "), true);

  assert.equal((await client.read("https://evil.example/api/resource/Item")).ok, false);
  assert.equal((await client.read("http://erp.example.test/api/resource/Item")).ok, false);
  assert.equal((await client.read("/api/method/frappe.client.get")).ok, false);
  assert.equal(client.write().code, "refused");
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(client.write()).includes("shadow-token"), false);
});
