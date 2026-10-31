import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactDigest } from "./artifact-digest.mjs";

try {
  const expectedSha = process.argv[2];
  const root = process.argv[3] ?? resolve(fileURLToPath(new URL("..", import.meta.url)));
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? "")) throw new Error("Exact reviewed source SHA required");
  const manifest = JSON.parse(await readFile(join(root, "dist/client/release-manifest.json"), "utf8"));
  if (manifest.releaseSha !== expectedSha || manifest.dirty !== false || manifest.launchProfile !== "DIRECT_COMMERCE_PRODUCTION") throw new Error("Production build identity mismatch");
  if (manifest.artifactDigest !== await artifactDigest(root)) throw new Error("Web artifact changed after build");
  // A synthetic Maps key must never ship: the mock tier's intercepted-fixture
  // value would take production users to a dead Google script. A missing key
  // is allowed (the widget degrades to manual entry) — only the fixture is fatal.
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY === "synthetic" || process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID === "synthetic") throw new Error("Synthetic Maps config is for the mock tier only");
  console.log(JSON.stringify({ event: "web.release_verified", releaseSha: expectedSha, artifactDigest: manifest.artifactDigest }));
} catch {
  console.error("WEB_RELEASE_VERIFICATION_FAILED");
  process.exitCode = 77;
}
