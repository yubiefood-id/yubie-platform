import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const { default: worker } = await import("../../dist/server/index.js");
const render = async (path) => worker.fetch(new Request(`https://yubiefood.com${path}`), env, ctx);

test("catalog home offers discovery and contact without commerce or collection forms", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /href=["']\/(?:account|cart|checkout|login)(?:[/?"'])/);
  assert.doesNotMatch(html, /<form\b|YUBIE15|codex-preview|checkout aman|meal replacement/i);
  assert.match(html, /mailto:hello@yubiefood\.com/);
  assert.match(html, /https:\/\/yubiefood\.com\//);
});

test("catalog PDPs keep variant prices without exposing cart or unapproved shelf life", async () => {
  for (const [slug, prices] of [["flour", ["35.000", "120.000"]], ["shake", ["19.500", "129.000"]], ["ppang", ["9.000", "19.000", "42.000"]], ["mie", ["16.000", "45.000"]]]) {
    const response = await render(`/products/yubie-${slug}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const price of prices) assert.ok(html.includes(price), `${slug} variant ${price} remains discoverable`);
    assert.doesNotMatch(html, /Add to Cart|<form\b|2 tahun|250–300|3–4 menit/);
    assert.match(html, /mailto:hello@yubiefood\.com/);
  }
});

test("old commerce deep links cannot mount authentication or claim an order outcome", async () => {
  for (const path of ["/cart", "/checkout", "/checkout/success?status=paid", "/checkout/cancel", "/login", "/account", "/account/orders", "/account/orders/preview"]) {
    const response = await render(path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Transaksi langsung belum tersedia/);
    assert.match(html, /noindex/);
    assert.doesNotMatch(html, /<form\b|Pembayaran terkonfirmasi|Memuat akun|Memuat status|accounts\.google\.com/);
  }
});

test("catalog adapters fail closed before contacting an upstream or accepting PII", async () => {
  let calls = 0;
  const upstream = createServer((_request, response) => { calls++; response.writeHead(200); response.end("{}"); });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const previous = process.env.YUBIE_API_ORIGIN;
  process.env.YUBIE_API_ORIGIN = `http://127.0.0.1:${upstream.address().port}`;
  try {
    for (const [path, method] of [["/api/auth/session", "GET"], ["/api/auth/google", "POST"], ["/api/checkout/session", "GET"], ["/api/checkout", "POST"], ["/api/newsletter", "POST"], ["/api/b2b", "POST"], ["/api/waitlist", "POST"], ["/api/purchase-options/yubie-flour", "GET"]]) {
      const response = await worker.fetch(new Request(`https://yubiefood.com${path}`, { method }), env, ctx);
      assert.equal(response.status, 503, path);
      assert.equal((await response.json()).code, "FEATURE_DISABLED");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.YUBIE_API_ORIGIN;
    else process.env.YUBIE_API_ORIGIN = previous;
    await new Promise((resolve) => upstream.close(resolve));
  }
});
