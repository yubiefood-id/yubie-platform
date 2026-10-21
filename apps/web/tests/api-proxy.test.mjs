import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

test("guest bootstrap through the built Worker preserves cookies and disables caching", async () => {
  const seen = [];
  const upstream = createServer((request, response) => {
    seen.push(request.url);
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "set-cookie": "yubie_checkout=synthetic-session; HttpOnly; SameSite=Lax; Path=/" });
    response.end(JSON.stringify({ ok: true, data: { ready: true } }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${upstream.address().port}`;
  const previous = process.env.YUBIE_API_ORIGIN;
  process.env.YUBIE_API_ORIGIN = origin;
  try {
    const { default: worker } = await import(`../dist/server/index.js?bootstrap=${Date.now()}`);
    const response = await worker.fetch(new Request("http://localhost/api/checkout/session"), { YUBIE_API_ORIGIN: origin, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {} });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, data: { ready: true } });
    assert.deepEqual(seen, ["/v1/checkouts/session"]);
    assert.match(response.headers.get("set-cookie") ?? "", /yubie_checkout=synthetic-session/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previous === undefined) delete process.env.YUBIE_API_ORIGIN;
    else process.env.YUBIE_API_ORIGIN = previous;
    await new Promise((resolve) => upstream.close(resolve));
  }
});
