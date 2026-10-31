import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function makeWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return import(workerUrl.href);
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

const legalRoutes = [
  [
    "/faq",
    [
      /CARE &amp; CLARITY|CARE & CLARITY/,
      /#pembayaran/,
      /iPaymu/,
      /refund-policy/,
      /privacy/,
      /\b24 jam\b/,
    ],
  ],
  [
    "/terms",
    [
      /Syarat &amp; Ketentuan|Syarat & Conditions/,
      /Versi\s*(?:<!--\s*-->\s*)?1\.0/,
      /Berlaku efektif sejak/,
      /Rupiah/,
      /PP 80\/2019|Nomor 80 Tahun 2019/,
      /UU 27\/2022|Nomor 27 Tahun 2022/,
      /BPSK/,
      /href="#pembatalan"/,
      /refund-policy/,
    ],
  ],
  [
    "/refund-policy",
    [
      /Kebijakan Pengembalian Dana dan Pembatalan/,
      /\[REFUND YUBIE\] - Nomor Pesanan/,
      /1×24 jam pada hari kerja/,
      /3 \(tiga\) hari kerja/,
      /5 \(lima\) hari kerja/,
      /Pasal 69/,
      /dana penuh|penuh \(full refund\)/,
    ],
  ],
  [
    "/contact",
    [
      /Hubungi/,
      /mailto:hello@yubiefood\.com/,
      /https:\/\/www\.instagram\.com\/yubiefood\.official\//,
      /https:\/\/www\.tiktok\.com\/@yubiefood\.official/,
      /Bogor, Jawa Barat, Indonesia/,
      /href="\/faq#produk"/,
      /href="\/b2b"/,
    ],
  ],
  [
    "/privacy",
    [
      /Kebijakan Privasi/,
      /UU PDP|UU 27\/2022|Nomor 27 Tahun 2022/,
      /iPaymu/,
      /lokasi/i,
      /cookie/i,
      /href="\/terms"/,
    ],
  ],
];

test("legal pages are public, canonical, and carry their key verified content", async () => {
  const { default: worker } = await makeWorker();
  for (const [path, patterns] of legalRoutes) {
    const response = await worker.fetch(new Request(`https://yubiefood.com${path}`, { headers: { accept: "text/html" } }), env, ctx);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, new RegExp(`<title>[^<]*· Yubie</title>`), `${path}: title template`);
    assert.match(html, new RegExp(`rel="canonical" href="https://yubiefood.com${path === "/" ? "" : path}"`), `${path}: canonical`);
    for (const pattern of patterns) assert.match(html, pattern, `${path}: ${pattern}`);
    // No unapproved certification/health claims on any legal surface.
    assert.doesNotMatch(html, /halal certified|BPOM registered|low glycemic index|tersertifikasi halal/i, `${path}: forbidden claim`);
  }
});

test("footer exposes every mandatory legal link and contact channel on public pages", async () => {
  const { default: worker } = await makeWorker();
  for (const path of ["/", "/faq", "/contact"]) {
    const response = await worker.fetch(new Request(`https://yubiefood.com${path}`, { headers: { accept: "text/html" } }), env, ctx);
    const html = await response.text();
    for (const href of ["/faq", "/contact", "/terms", "/refund-policy", "/privacy"]) {
      assert.match(html, new RegExp(`href="${href}"`), `${path}: footer link ${href}`);
    }
    assert.match(html, /mailto:hello@yubiefood\.com/, `${path}: footer email`);
    assert.match(html, /Bogor, Jawa Barat, Indonesia/, `${path}: footer region`);
  }
});

test("sitemap lists the merchant-verification routes", async () => {
  const { default: worker } = await makeWorker();
  const sitemap = await worker.fetch(new Request("https://yubiefood.com/sitemap.xml"), env, ctx);
  const xml = await sitemap.text();
  assert.match(xml, /https:\/\/yubiefood\.com\/contact/);
  assert.match(xml, /https:\/\/yubiefood\.com\/refund-policy/);
});

test("merchant identity renders completely and consistently, or not at all", async () => {
  const { default: worker } = await makeWorker();
  const contactResponse = await worker.fetch(new Request("https://yubiefood.com/contact", { headers: { accept: "text/html" } }), env, ctx);
  const contact = await contactResponse.text();
  const requiredFields = ["legal-name", "entity-type", "address", "phone", "support-hours"];
  const marker = /data-merchant-field="([^"]+)"/;
  const identityRendered = marker.test(contact);

  for (const path of ["/contact", "/terms", "/refund-policy", "/", "/faq", "/privacy"]) {
    const response = await worker.fetch(new Request(`https://yubiefood.com${path}`, { headers: { accept: "text/html" } }), env, ctx);
    const html = await response.text();
    if (!identityRendered) {
      // Gated mode: no partial identity and no placeholder text anywhere.
      assert.doesNotMatch(html, /data-merchant-field=/, `${path}: partial identity leaked in gated mode`);
      assert.doesNotMatch(html, /\b(?:TBD|TODO|XXX)\b|lorem ipsum|\bmenyusul\b|\bsegera diperbarui\b|\[(?:nama|alamat|telepon|jam)[^\]]*\]/i, `${path}: placeholder marker`);
      continue;
    }
    if (path !== "/contact") continue;
    for (const field of requiredFields) {
      assert.match(contact, new RegExp(`data-merchant-field="${field}"`), `/contact: missing ${field}`);
    }
    // The same verified value must never diverge across surfaces. React
    // interpolation comments are stripped so markers hold one exact value.
    const strip = (markup) => markup.replace(/<!--.*?-->/g, "");
    const value = (field) => strip(contact).match(new RegExp(`<[^>]*data-merchant-field="${field}"[^>]*>([^<]+)<`))?.[1]?.trim();
    const address = value("address");
    const phone = value("phone");
    assert.ok(address && address.length >= 10, "/contact: address marker is empty");
    assert.match(phone ?? "", /^\+?[0-9 ()-]{8,}$/, "/contact: phone marker is empty");
    for (const path2 of ["/terms", "/refund-policy", "/"]) {
      const html2 = strip(await (await worker.fetch(new Request(`https://yubiefood.com${path2}`, { headers: { accept: "text/html" } }), env, ctx)).text());
      const address2 = html2.match(new RegExp(`<[^>]*data-merchant-field="address"[^>]*>([^<]+)<`))?.[1]?.trim();
      if (address2 !== undefined) assert.equal(address2, address, `address differs between /contact and ${path2}`);
      const phone2 = html2.match(new RegExp(`<[^>]*data-merchant-field="phone"[^>]*>([^<]+)<`))?.[1]?.trim();
      if (phone2 !== undefined) assert.equal(phone2, phone, `phone differs between /contact and ${path2}`);
    }
  }
});

test("the merchant-identity release gate agrees with the rendered artifact", async () => {
  // This suite builds the worker first (see the package test script); the gate
  // script reads the same artifact, so its verdict must match what renders.
  const { default: worker } = await makeWorker();
  const contact = await (await worker.fetch(new Request("https://yubiefood.com/contact", { headers: { accept: "text/html" } }), env, ctx)).text();
  const identityRendered = /data-merchant-field="/.test(contact);
  const result = spawnSync(process.execPath, [join(here, "..", "scripts", "verify-merchant-identity.mjs")], { encoding: "utf8" });
  assert.equal(result.status, identityRendered ? 0 : 77, `gate exit ${result.status} vs rendered ${identityRendered}\n${result.stdout}${result.stderr}`);
});
