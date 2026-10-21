import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";

const root = new URL("../../../../", import.meta.url);
const output = new URL(".vercel/output/", root);
const exists = async (url) => access(url).then(() => true, () => false);
const read = async (path) => readFile(new URL(path, output), "utf8");

test("public JavaScript, RSC and HTML never publish unapproved label specifications", async () => {
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await scan(path);
      else if (/\.(?:js|rsc|html)$/.test(entry.name)) assert.doesNotMatch(await readFile(path, "utf8"), /2 tahun sesuai|Lactobacillus plantarum|microwave 15|250–300 mL|150°C/);
    }
  }
  await scan(new URL("static/", output));
});

test("deployable catalog contains HTML, RSC, robots and a canonical sitemap", async () => {
  for (const path of ["index.html", "index.rsc", "products.html", "products.rsc", "products/yubie-flour.html", "products/yubie-shake.html", "products/yubie-ppang.html", "products/yubie-mie.html", "robots.txt", "sitemap.xml"]) {
    assert.equal(await exists(new URL(`static/${path}`, output)), true, `missing emitted artifact ${path}`);
  }
  const robots = await read("static/robots.txt");
  assert.match(robots, /Sitemap: https:\/\/yubiefood\.com\/sitemap\.xml/);
  const xml = await read("static/sitemap.xml");
  assert.match(xml, /https:\/\/yubiefood\.com\/products\/yubie-mie/);
  assert.doesNotMatch(xml, /yubie\.id|\/checkout|\/account|\/login|staging/);
});

test("Vercel output disables API requests and delivers CSP hashes for the actual HTML", async () => {
  assert.equal(await exists(new URL("config.json", output)), true, "missing Vercel output configuration");
  const config = JSON.parse(await read("config.json"));
  assert.equal(config.version, 3);
  const api = config.routes.find((route) => route.src && new RegExp(route.src).test("/api/checkout"));
  // Common continuing header routes may match too: select the terminal rule.
  const disabled = config.routes.find((route) => route.status === 503 && new RegExp(route.src).test("/api/checkout"));
  assert.ok(api && disabled);
  assert.equal(disabled.dest, "/feature-disabled.json");
  assert.equal(new RegExp(disabled.src).test("/assets/api-origin-example.js"), false, "API boundary must not disable JavaScript assets");
  const home = config.routes.find((route) => route.dest === "/index.html");
  assert.ok(home);
  assert.equal(home.headers["X-Content-Type-Options"], "nosniff");
  const csp = home.headers["Content-Security-Policy"];
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)?.[0] ?? "", /unsafe-inline|unsafe-eval/);
  const html = await read("static/index.html");
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(attrs) || !body) continue;
    assert.ok(csp.includes(`'sha256-${createHash("sha256").update(body).digest("base64")}'`), "inline script missing from page CSP");
  }
  const preview = config.routes.find((route) => route.headers?.["X-Robots-Tag"] === "noindex, nofollow");
  assert.ok(preview?.has?.some((condition) => condition.type === "host"));
});

test("exported font URLs refer to files included in the portable static artifact", async () => {
  const html = await read("static/index.html");
  const fonts = [...html.matchAll(/url\(([^)]+\.woff2)\)/g)].map((match) => match[1]);
  assert.ok(fonts.length > 0);
  for (const font of fonts) assert.equal(await exists(new URL(`static${font}`, output)), true, "font URL must resolve inside the emitted static artifact");
});

test("release manifest binds the catalog profile and files to a source revision", async () => {
  assert.equal(await exists(new URL("static/release-manifest.json", output)), true, "missing release identity");
  const manifest = JSON.parse(await read("static/release-manifest.json"));
  assert.equal(manifest.launchProfile, "PUBLIC_CATALOG_NO_SALES");
  assert.equal(manifest.paymentMode, "disabled");
  assert.match(manifest.sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(manifest.canonicalOrigin, "https://yubiefood.com");
  assert.equal(manifest.contactEmail, "hello@yubiefood.com");
  assert.match(manifest.artifactDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(manifest.approvalStatus, "REQUIRES_OWNER_APPROVAL");
});
