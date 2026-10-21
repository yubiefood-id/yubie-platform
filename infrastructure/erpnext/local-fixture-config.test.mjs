import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("malformed private credential JSON never leaks input fragments", async () => {
  const home = await mkdtemp(join(tmpdir(), "yubie-private-test-"));
  const directory = join(home, ".local/state/yubie/erp-native/20300101");
  try {
    await mkdir(directory, { mode: 0o700, recursive: true });
    const path = join(directory, "users.json");
    await writeFile(path, '{"password":SYNTHETIC_SECRET_FRAGMENT}', { mode: 0o600 });
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `import {localCredentials} from ${JSON.stringify(new URL("./local-fixture-config.mjs", import.meta.url).href)}; await localCredentials();`], { encoding: "utf8", env: { ...process.env, HOME: home, ERP_LOCAL_CREDENTIALS_FILE: path } });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr + result.stdout, /SYNTHETIC|password/);
    assert.match(result.stderr, /ERP_LOCAL_CONFIG/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
