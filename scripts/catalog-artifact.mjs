import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DefaultRedirectAllowlistPolicy } from "@yubie/integrations";
import { productFamilies } from "@yubie/domain";

export const CATALOG_ORIGIN = "https://yubiefood.com";
export const CONTACT_EMAIL = "hello@yubiefood.com";
export const publicCatalogRoutes = ["/", "/products", "/our-story", "/our-roots", "/impact", "/b2b", "/faq", "/privacy", "/terms", "/refund-policy", "/contact", ...productFamilies.map((product) => `/products/${product.slug}`)];
export const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

export function validateCatalogListings(manifest, profile) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.listings)) throw new Error("CATALOG_CONFIG: invalid listing manifest");
  const allowlist = new DefaultRedirectAllowlistPolicy();
  const keys = new Set();
  for (const listing of manifest.listings) {
    const product = productFamilies.find((item) => item.id === listing.productId);
    let url;
    try { url = new URL(listing.publicUrl); }
    catch { throw new Error("CATALOG_CONFIG: invalid listing destination"); }
    if (!product || listing.status !== "active" || !/^[a-z0-9_-]{1,80}$/.test(listing.listingKey ?? "") || keys.has(listing.listingKey)) throw new Error("CATALOG_CONFIG: invalid or duplicate listing identity");
    if (listing.skuId && !product.sizes.some((size) => size.sku === listing.skuId)) throw new Error("CATALOG_CONFIG: unmapped listing SKU");
    if (!allowlist.isAllowedUrl(listing.publicUrl, listing.marketplace) || url.username || url.password || url.port || url.hash || url.pathname === "/") throw new Error("CATALOG_CONFIG: listing destination is not an approved marketplace URL");
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,159}$/.test(listing.approvalRef ?? "") || !Number.isFinite(Date.parse(listing.verifiedAt ?? ""))) throw new Error("CATALOG_CONFIG: listing requires a dated approval reference");
    keys.add(listing.listingKey);
  }
  if (profile === "MARKETPLACE_MSP" && manifest.listings.length === 0) throw new Error("CATALOG_CONFIG: no approved listings; select PUBLIC_CATALOG_NO_SALES");
}

export function htmlHeaders(html) {
  const hashes = new Set();
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(attrs) && body) hashes.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  }
  return {
    ...baseHeaders,
    "Content-Security-Policy": `default-src 'self'; script-src 'self' ${[...hashes].join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  };
}

export async function artifactFiles(root, prefix = "") {
  const files = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("CATALOG_ARTIFACT: symlinks are forbidden");
    if (entry.isDirectory()) files.push(...await artifactFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function catalogDigest(output, identity) {
  const files = [];
  for (const path of await artifactFiles(output)) {
    if (path === "static/release-manifest.json") continue;
    files.push({ path, sha256: createHash("sha256").update(await readFile(join(output, path))).digest("hex") });
  }
  return `sha256:${createHash("sha256").update(JSON.stringify({ identity, files })).digest("hex")}`;
}

export async function verifyCatalogOutput(output) {
  const manifest = JSON.parse(await readFile(join(output, "static/release-manifest.json"), "utf8"));
  const { artifactDigest, ...identity } = manifest;
  if (!/^[a-f0-9]{40}$/.test(identity.sourceSha) || !["PUBLIC_CATALOG_NO_SALES", "MARKETPLACE_MSP"].includes(identity.launchProfile) || identity.paymentMode !== "disabled" || identity.canonicalOrigin !== CATALOG_ORIGIN || identity.contactEmail !== CONTACT_EMAIL || identity.approvalStatus !== "REQUIRES_OWNER_APPROVAL") throw new Error("CATALOG_ARTIFACT: invalid release identity");
  if (artifactDigest !== await catalogDigest(output, identity)) throw new Error("CATALOG_ARTIFACT: artifact digest mismatch");
  const config = JSON.parse(await readFile(join(output, "config.json"), "utf8"));
  if (config.version !== 3 || !config.routes.some((route) => route.status === 503 && route.dest === "/feature-disabled.json")) throw new Error("CATALOG_ARTIFACT: disabled API route missing");
  for (const route of publicCatalogRoutes) {
    const path = route === "/" ? "index.html" : `${route.slice(1)}.html`;
    const html = await readFile(join(output, "static", path), "utf8");
    if (!/<main\b/.test(html) || /<form\b|name="codex-preview"|href="\/(?:cart|checkout|account|login)(?:[/?"])/i.test(html)) throw new Error(`CATALOG_ARTIFACT: unsafe or incomplete public page ${route}`);
    if (/<(?:meta|link)[^>]+(?:href|content)="https:\/\/(?:www\.)?yubie\.id(?:\/|")/.test(html)) throw new Error("CATALOG_ARTIFACT: obsolete first-party origin");
    const configured = config.routes.find((row) => row.dest === `/${path}`);
    if (!configured || configured.headers["Content-Security-Policy"] !== htmlHeaders(html)["Content-Security-Policy"]) throw new Error(`CATALOG_ARTIFACT: CSP does not match emitted page ${route}`);
  }
  return manifest;
}
