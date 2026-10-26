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
