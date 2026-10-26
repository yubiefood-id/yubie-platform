import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("browser CI rewrites direct and mirror-list sources while preserving signed suites", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const block = workflow.match(/- name: Use the official Ubuntu HTTPS archive for browser dependencies\n        run: \|\n([\s\S]*?)(?=\n      -)/);
  assert(block, "browser dependency source step missing");
  const script = block[1].split("\n").map(line => line.slice(10)).join("\n");
  const root = mkdtempSync(join(tmpdir(), "yubie-ci-mirror-"));
  const apt = join(root, "apt");
  mkdirSync(join(apt, "sources.list.d"), { recursive: true });
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/sudo"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  const fixtures = {
    "sources.list": "deb http://azure.archive.ubuntu.com/ubuntu noble main\n",
    "sources.list.d/ubuntu.sources": "Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-security\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n",
    "apt-mirrors.txt": "http://azure.archive.ubuntu.com/ubuntu/\nhttps://archive.ubuntu.com/ubuntu/\n",
    "apt-mirrors-security.txt": "https://azure.archive.ubuntu.com/ubuntu/\nhttps://security.ubuntu.com/ubuntu/\n",
  };
  try {
    for (const [name, bytes] of Object.entries(fixtures)) writeFileSync(join(apt, name), bytes);
    const result = spawnSync("bash", ["-e", "-c", script.replaceAll("/etc/apt", apt)], { encoding: "utf8", env: { PATH: `${root}/bin:/usr/bin:/bin`, LANG: "C.UTF-8" } });
    assert.equal(result.status, 0, result.stderr);
    for (const [name, bytes] of Object.entries(fixtures)) {
      assert.equal(readFileSync(join(apt, name), "utf8"), bytes.replaceAll(/https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu/g, "https://archive.ubuntu.com/ubuntu"), name);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
