import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders Yubie commerce and supporting routes", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("routes", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const checks = [
    ["/shop", /Yubie Flour/],
    ["/products/yubie-flour", /Rp(?:&nbsp;|\s)*15\.000/],
    ["/b2b", /BUILD YOUR NEXT PRODUCT/],
    ["/impact", /Responsible evidence/],
    ["/checkout", /CHECKOUT PROTOTYPE/],
  ];
  for (const [path, pattern] of checks) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), env, ctx);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), pattern, path);
  }
});

test("does not publish unverified certification claims as product facts", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("claims", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.doesNotMatch(html, /halal certified|BPOM registered|low glycemic index/i);
});

test("homepage preserves hero and follows required semantic section order", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("homepage-revision", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.match(html, /ROOTED HERE[\s\S]*MADE FOR NOW/);
  const order = ["products", "five-roots", "why-yubie", "flour-applications", "recipes", "our-roots", "b2b", "community"].map((section) => html.indexOf(`data-home-section=\"${section}\"`));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.doesNotMatch(html, /antosianin|beta-karoten|polifenol|kaya serat/i);
});

test("product pages enforce available versus coming-soon commerce states", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("product-revision", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const flourHtml = await (await worker.fetch(new Request("http://localhost/products/yubie-flour", { headers: { accept: "text/html" } }), env, ctx)).text();
  const shakeHtml = await (await worker.fetch(new Request("http://localhost/products/yubie-shake", { headers: { accept: "text/html" } }), env, ctx)).text();
  const ppangHtml = await (await worker.fetch(new Request("http://localhost/products/yubie-ppang", { headers: { accept: "text/html" } }), env, ctx)).text();
  assert.match(flourHtml, /CHOOSE YOUR ROOT/i);
  assert.match(flourHtml, /Add to Cart/);
  assert.match(shakeHtml, /POUR[\s\S]*ADD WATER[\s\S]*MIX/i);
  assert.match(ppangHtml, /KEEP FROZEN[\s\S]*HEAT[\s\S]*ENJOY/i);
  assert.doesNotMatch(shakeHtml, /Add to Cart/);
  assert.doesNotMatch(ppangHtml, /Add to Cart/);
});

test("recipes and B2B expose revised relationships and offering language", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("supporting-revision", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const recipeHtml = await (await worker.fetch(new Request("http://localhost/recipes/purple-pancakes", { headers: { accept: "text/html" } }), env, ctx)).text();
  const b2bHtml = await (await worker.fetch(new Request("http://localhost/b2b", { headers: { accept: "text/html" } }), env, ctx)).text();
  assert.match(recipeHtml, /MADE WITH[\s\S]*Yubie Flour[\s\S]*Ubi Ungu/i);
  assert.doesNotMatch(recipeHtml, /\"@type\":\"Recipe\"/);
  assert.match(b2bHtml, /Bulk Ingredients[\s\S]*Product Sampling[\s\S]*Product Development/);
});
