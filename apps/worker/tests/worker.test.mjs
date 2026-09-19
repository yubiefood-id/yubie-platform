import assert from "node:assert/strict";
import test from "node:test";

test("worker package builds", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../dist/index.js"), "utf8");
  assert.match(index, /listing\.health/);
  assert.match(index, /assistant\.process/);
});
