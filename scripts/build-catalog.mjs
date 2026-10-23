import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseLaunchProfile } from "@yubie/config/launch";
import { sourceTreeDirty } from "./catalog-provenance.mjs";
import { artifactFiles, baseHeaders, catalogDigest, CATALOG_ORIGIN, CONTACT_EMAIL, htmlHeaders, publicCatalogRoutes, validateCatalogListings, verifyCatalogOutput } from "./catalog-artifact.mjs";

const root = resolve(import.meta.dirname, "..");
const profile = parseLaunchProfile(process.env.NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE);
if (profile === "DIRECT_COMMERCE_SANDBOX" || profile === "DIRECT_COMMERCE_PRODUCTION") throw new Error("CATALOG_CONFIG: static release cannot contain direct commerce");
const listings = JSON.parse(await readFile(resolve(root, "apps/web/config/approved-marketplace-listings.json"), "utf8"));
validateCatalogListings(listings, profile);
const revision = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("CATALOG_CONFIG: a full source SHA is required");
const dirty = sourceTreeDirty(root);
const build = spawnSync("npm", ["run", "build", "--workspace", "@yubie/web"], {
  cwd: root, stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE: profile, YUBIE_STATIC_EXPORT: "1" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const output = resolve(root, ".vercel/output");
const staticDir = resolve(output, "static");
await rm(output, { recursive: true, force: true });
await mkdir(staticDir, { recursive: true });
await cp(resolve(root, "apps/web/dist/client"), staticDir, { recursive: true });
await writeFile(resolve(staticDir, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api\nDisallow: /account\nDisallow: /cart\nDisallow: /checkout\nDisallow: /login\nSitemap: ${CATALOG_ORIGIN}/sitemap.xml\n`);
await writeFile(resolve(staticDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicCatalogRoutes.map((route) => `<url><loc>${CATALOG_ORIGIN}${route}</loc></url>`).join("")}</urlset>\n`);
await writeFile(resolve(staticDir, "feature-disabled.json"), JSON.stringify({ ok: false, code: "FEATURE_DISABLED" }));

const routes = [
  { src: "/.*", headers: baseHeaders, continue: true },
  { src: "/.*", has: [{ type: "host", value: { ninc: ["yubiefood.com", "www.yubiefood.com"] } }], headers: { "X-Robots-Tag": "noindex, nofollow" }, continue: true },
  { src: "^/api(?:/.*)?$", dest: "/feature-disabled.json", status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
];
for (const file of await artifactFiles(staticDir)) {
  if (!file.endsWith(".html")) continue;
  const html = await readFile(resolve(staticDir, file), "utf8");
  const pathname = file === "index.html" ? "/" : `/${file.slice(0, -5)}`;
  const escaped = pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headers = htmlHeaders(html);
  if (/^\/(?:account|cart|checkout|login)(?:\/|$)/.test(pathname)) headers["X-Robots-Tag"] = "noindex, nofollow";
  routes.push({ src: `^(?:${escaped === "/" ? "/" : `${escaped}/?`}|/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})$`, dest: `/${file}`, headers });
}
const unavailable = await readFile(resolve(staticDir, "account.html"), "utf8");
routes.push({ src: "^/account/orders/[^/]+/?$", dest: "/account.html", headers: { ...htmlHeaders(unavailable), "X-Robots-Tag": "noindex, nofollow" } });
routes.push({ src: "^/\\.rsc$", dest: "/index.rsc", headers: { "Content-Type": "text/x-component" } });
routes.push({ src: "/.*\\.rsc", headers: { "Content-Type": "text/x-component" }, continue: true });
routes.push({ handle: "filesystem" });
routes.push({ src: "/.*", status: 404, dest: "/404.html", headers: htmlHeaders(await readFile(resolve(staticDir, "404.html"), "utf8")) });
await writeFile(resolve(output, "config.json"), JSON.stringify({ version: 3, routes }, null, 2) + "\n");
const identity = { schemaVersion: 1, sourceSha: revision, sourceDirty: dirty, launchProfile: profile, paymentMode: "disabled", canonicalOrigin: CATALOG_ORIGIN, contactEmail: CONTACT_EMAIL, approvalStatus: "REQUIRES_OWNER_APPROVAL" };
const artifactDigest = await catalogDigest(output, identity);
await writeFile(resolve(staticDir, "release-manifest.json"), JSON.stringify({ ...identity, artifactDigest }, null, 2) + "\n");
await verifyCatalogOutput(output);
console.log(JSON.stringify({ status: "CATALOG_ARTIFACT_VERIFIED", ...identity, artifactDigest }));
