#!/usr/bin/env node
/**
 * Release gate: the storefront artifact must carry a COMPLETE, owner-verified
 * merchant identity before it is deployed for iPaymu merchant verification.
 *
 * Run AFTER a web build (`npm run build --workspace @yubie/web`). Exits 0 when
 * every required identity field is present and identical across all public
 * surfaces (contact page, terms, refund policy, footer); exits 77 with the
 * exact missing items otherwise. This gate is intentionally NOT part of
 * `npm run check` — CI stays green while the identity is pending — but the
 * frontend deploy runbook MUST run it first and act on a non-zero exit.
 */
import { exit } from "node:process";

const REQUIRED_ON_CONTACT = ["legal-name", "entity-type", "address", "phone", "support-hours"];
const REQUIRED_ON_FOOTER = ["address", "phone"];
const CHECKED_ROUTES = ["/contact", "/terms", "/refund-policy"];
const PLACEHOLDER_PATTERNS = [
  /\b(?:TBD|TODO|XXX)\b/,
  /lorem ipsum/i,
  /\bmenyusul\b/i,
  /\bsegera diperbarui\b/i,
  /\[(?:nama|alamat|telepon|jam)[^\]]*\]/i,
];

const failures = [];

function extractFields(html) {
  // React inserts <!-- --> separators between interpolated text nodes; strip
  // them so a marker's text content is one exact value.
  const fields = new Map();
  const markup = html.replace(/<!--.*?-->/g, "");
  for (const [, field, text] of markup.matchAll(/<[^>]*data-merchant-field="([^"]+)"[^>]*>([^<]+)</g)) {
    const value = text.trim();
    if (value) fields.set(field, value);
  }
  return fields;
}

async function main() {
  let worker;
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("gate", `${process.pid}-${Date.now()}`);
    ({ default: worker } = await import(workerUrl.href));
  } catch {
    console.error("GATE: build aplikasi web tidak ditemukan. Jalankan `npm run build --workspace @yubie/web` dulu.");
    return 77;
  }
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  const fetchPage = async (route) => {
    const response = await worker.fetch(new Request(`https://yubiefood.com${route}`, { headers: { accept: "text/html" } }), env, ctx);
    if (response.status !== 200) {
      failures.push(`${route}: HTTP ${response.status} (halaman identitas merchant harus publik)`);
      return null;
    }
    return await response.text();
  };

  const pages = new Map();
  for (const route of [...CHECKED_ROUTES, "/"]) pages.set(route, await fetchPage(route));

  for (const [route, html] of pages) {
    if (!html) continue;
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(html)) failures.push(`${route}: ditemukan teks placeholder (${pattern})`);
    }
  }

  const contact = extractFields(pages.get("/contact") ?? "");
  for (const field of REQUIRED_ON_CONTACT) {
    if (!contact.has(field)) failures.push(`/contact: field identitas wajib "${field}" tidak ada di HTML hasil build`);
  }

  const footer = extractFields(pages.get("/") ?? "");
  for (const field of REQUIRED_ON_FOOTER) {
    if (!footer.has(field)) failures.push(`footer (/): field identitas wajib "${field}" tidak ada`);
  }

  // Identity values must be identical on every surface that shows them.
  for (const [route, html] of pages) {
    if (route === "/contact" || !html) continue;
    for (const [field, value] of extractFields(html)) {
      if (contact.has(field) && contact.get(field) !== value) {
        failures.push(`identitas "${field}" berbeda antara /contact dan ${route}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("MERCHANT_IDENTITY_GATE: GAGAL — identitas merchant belum lengkap/konsisten untuk rilis verifikasi iPaymu.");
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error("Isi field yang belum terverifikasi di apps/web/config/merchant-identity.ts sesuai profil merchant iPaymu yang disetujui owner, lalu build ulang dan jalankan ulang gate ini.");
    return 77;
  }
  console.log("MERCHANT_IDENTITY_GATE: OK — identitas merchant lengkap dan konsisten di semua halaman publik.");
  return 0;
}

exit(await main());
