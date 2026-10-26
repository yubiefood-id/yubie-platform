import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("restricted release policy and deployment regression tests", () => {
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "scripts/tests", "-p", "release_*_test.py"], { encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
