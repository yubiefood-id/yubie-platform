import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

function makeWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return import(workerUrl.href);
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("renders development preview metadata", async () => {
  const { default: worker } = await makeWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders catalog, product, and supporting routes", async () => {
  const { default: worker } = await makeWorker();
  const checks = [
    ["/products", /Yubie Flour[\s\S]*Yubie Mie/],
    ["/products", /Mulai/],
    ["/products/yubie-flour", /BELI RESMI|Memuat opsi beli/],
    ["/products/yubie-mie", /COMING SOON/i],
    ["/our-roots", /FIVE ROOTS[\s\S]*Purple Pancakes/],
    ["/b2b", /BUILD YOUR NEXT PRODUCT/],
    ["/impact", /Responsible evidence/],
    ["/login", /AKUN YUBIE/],
    ["/account", /Memuat akun/],
    ["/checkout/cancel", /dibatalkan/i],
  ];
  for (const [path, pattern] of checks) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, ctx);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), pattern, path);
  }
});

test("success page renders server-verified states, never assumes payment", async () => {
  const { default: worker } = await makeWorker();
  const response = await worker.fetch(new Request("http://localhost/checkout/success", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /STATUS PEMBAYARAN|Memuat status/);
  assert.match(html, /noindex,\s*nofollow/i);
  assert.doesNotMatch(html, /Pembayaran terkonfirmasi/);
});

test("legacy shop and recipe routes redirect into the revised IA", async () => {
  const { default: worker } = await makeWorker();
  const checks = [
    ["/shop", "/products"],
    ["/recipes", "/our-roots"],
    ["/recipes/purple-pancakes", "/our-roots"],
  ];
  for (const [path, target] of checks) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, ctx);
    const location = response.headers.get("location") ?? "";
    const html = await response.text();
    assert.ok(
      [301, 302, 307, 308].includes(response.status) && location.includes(target) || html.includes(target),
      `${path} should redirect to ${target} (status ${response.status}, location ${location})`,
    );
  }
});

test("does not publish unverified certification claims as product facts", async () => {
  const { default: worker } = await makeWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  const html = await response.text();
  assert.doesNotMatch(html, /halal certified|BPOM registered|low glycemic index/i);
});

test("homepage preserves hero and follows required semantic section order", async () => {
  const { default: worker } = await makeWorker();
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  const html = await response.text();
  assert.match(html, /ROOTED HERE[\s\S]*MADE FOR NOW/);
  assert.match(html, /Four formats/);
  const order = ["products", "our-roots-story", "five-roots", "why-yubie", "lifestyle", "b2b", "community"].map((section) => html.indexOf(`data-home-section="${section}"`));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.doesNotMatch(html, /antosianin|beta-karoten|polifenol|kaya serat/i);
});

test("flour PDP exposes add-to-cart with verified pricing; coming-soon family stays gated", async () => {
  const { default: worker } = await makeWorker();
  const fetchText = async (path) => await (await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, ctx)).text();
  const flourHtml = await fetchText("/products/yubie-flour");
  const shakeHtml = await fetchText("/products/yubie-shake");
  const ppangHtml = await fetchText("/products/yubie-ppang");
  const mieHtml = await fetchText("/products/yubie-mie");
  assert.match(flourHtml, /CHOOSE YOUR ROOT/i);
  assert.match(flourHtml, /Add to Cart/);
  assert.match(flourHtml, /15\.000/);
  assert.match(shakeHtml, /POUR[\s\S]*ADD WATER[\s\S]*MIX/);
  assert.match(ppangHtml, /KEEP FROZEN[\s\S]*HEAT[\s\S]*ENJOY/);
  for (const html of [shakeHtml, ppangHtml, mieHtml]) {
    assert.doesNotMatch(html, /Add to Cart/);
    assert.doesNotMatch(html, /Mulai Rp/);
  }
});

test("B2B page keeps the offering language", async () => {
  const { default: worker } = await makeWorker();
  const response = await worker.fetch(new Request("http://localhost/b2b", { headers: { accept: "text/html" } }), env, ctx);
  const html = await response.text();
  assert.match(html, /Bulk Ingredients[\s\S]*Product Sampling[\s\S]*Product Development/);
});

test("cart and checkout render honest first-party states without faking payment", async () => {
  const { default: worker } = await makeWorker();
  for (const [path, pattern] of [["/cart", /Memuat keranjang|Keranjang/], ["/checkout", /Memuat checkout|belum aktif/i]]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, ctx);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, pattern, path);
    assert.match(html, /noindex,\s*nofollow/i, `${path} must stay noindex`);
  }
});
