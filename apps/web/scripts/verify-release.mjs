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
  console.log(JSON.stringify({ event: "web.release_verified", releaseSha: expectedSha, artifactDigest: manifest.artifactDigest }));
} catch {
  console.error("WEB_RELEASE_VERIFICATION_FAILED");
  process.exitCode = 77;
}
