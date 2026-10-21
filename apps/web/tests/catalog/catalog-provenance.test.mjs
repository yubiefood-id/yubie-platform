import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { sourceTreeDirty } from "../../../../scripts/catalog-provenance.mjs";

test("untracked application inputs cannot attest to a clean source revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "yubie-provenance-"));
  try {
    execFileSync("git", ["init", "--quiet", root]);
    await mkdir(join(root, "apps"));
    assert.equal(sourceTreeDirty(root), false);
    await writeFile(join(root, "apps/catalog.ts"), "export const release = 1;");
    assert.equal(sourceTreeDirty(root), true);
    execFileSync("git", ["-C", root, "add", "apps/catalog.ts"]);
    assert.equal(sourceTreeDirty(root), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
