import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

test("published web identity rejects changed bytes, wrong source, profile and dirty builds", () => {
  const root = mkdtempSync(join(tmpdir(), "yubie-web-proof-"));
  const sha = "a".repeat(40);
  mkdirSync(join(root, "dist/client"), { recursive: true });
  mkdirSync(join(root, "dist/server"));
  writeFileSync(join(root, "dist/client/a.js"), "client\n");
  writeFileSync(join(root, "dist/server/index.js"), "server\n");
  const files = [
    { path: "client/a.js", sha256: createHash("sha256").update("client\n").digest("hex") },
    { path: "server/index.js", sha256: createHash("sha256").update("server\n").digest("hex") },
  ];
  const manifest = { releaseSha: sha, dirty: false, launchProfile: "DIRECT_COMMERCE_PRODUCTION", artifactDigest: "sha256:" + createHash("sha256").update(JSON.stringify(files)).digest("hex") };
  const invoke = () => spawnSync("node", ["apps/web/scripts/verify-release.mjs", sha, root], { encoding: "utf8" });
  const save = (value) => writeFileSync(join(root, "dist/client/release-manifest.json"), JSON.stringify(value));
  try {
    save(manifest);
    assert.equal(invoke().status, 0);
    for (const changed of [{ dirty: true }, { releaseSha: "b".repeat(40) }, { launchProfile: "DIRECT_COMMERCE_SANDBOX" }]) {
      save({ ...manifest, ...changed });
      assert.equal(invoke().status, 77);
    }
    save(manifest);
    writeFileSync(join(root, "dist/server/index.js"), "changed\n");
    assert.equal(invoke().status, 77);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("synthetic Maps config can never verify as a production web release", () => {
  const root = mkdtempSync(join(tmpdir(), "yubie-web-maps-proof-"));
  const sha = "c".repeat(40);
  mkdirSync(join(root, "dist/client"), { recursive: true });
  mkdirSync(join(root, "dist/server"));
  writeFileSync(join(root, "dist/client/a.js"), "client\n");
  writeFileSync(join(root, "dist/server/index.js"), "server\n");
  const files = [
    { path: "client/a.js", sha256: createHash("sha256").update("client\n").digest("hex") },
    { path: "server/index.js", sha256: createHash("sha256").update("server\n").digest("hex") },
  ];
  const manifest = { releaseSha: sha, dirty: false, launchProfile: "DIRECT_COMMERCE_PRODUCTION", artifactDigest: "sha256:" + createHash("sha256").update(JSON.stringify(files)).digest("hex") };
  writeFileSync(join(root, "dist/client/release-manifest.json"), JSON.stringify(manifest));
  const invoke = () => spawnSync("node", ["apps/web/scripts/verify-release.mjs", sha, root], { encoding: "utf8" });
  const previousBrowserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const previousMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  try {
    for (const [browserKey, mapId] of [["synthetic", "map-prod"], ["real-key", "synthetic"], ["", ""]]) {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = browserKey;
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID = mapId;
      assert.equal(browserKey === "synthetic" || mapId === "synthetic" ? 77 : 0, invoke().status, `browserKey=${browserKey} mapId=${mapId}`);
    }
  } finally {
    if (previousBrowserKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY; else process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = previousBrowserKey;
    if (previousMapId === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID; else process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID = previousMapId;
    rmSync(root, { recursive: true, force: true });
  }
});
