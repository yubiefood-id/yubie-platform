#!/usr/bin/env node
/**
 * Repo secret scan for CI and local pre-flight: walks every git-tracked file
 * through the graphify deny rules (path patterns + content token patterns).
 * Exits 1 listing offenders; never prints the matched content itself.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeniedPath, scanContentForSecrets } from "./graphify/secret-scan.mjs";

/**
 * Reviewed, non-secret content that trips the deny rules. Documentation about
 * secrets, and the scanner's own source/tests, are safe by construction —
 * every addition here must be a specific reviewed path, never a wildcard.
 */
const ALLOWLIST = new Set([
  "docs/production/vps/05_SECRETS_IDENTITY_ACCESS.md",
  "scripts/graphify/secret-scan.mjs",
  "scripts/graphify/tests/secret-scan.test.mjs",
  ".agents/skills/api-design-principles/references/rest-best-practices.md",
]);

const TEXT_EXTENSIONS = new Set([
  "", ".json", ".md", ".txt", ".mjs", ".js", ".ts", ".tsx", ".jsx", ".yml", ".yaml",
  ".toml", ".env", ".example", ".sh", ".sql", ".html", ".css", ".svg", ".xml", ".gitignore",
]);

function isTextFile(filePath) {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const offenders = [];
for (const filePath of tracked) {
  if (ALLOWLIST.has(filePath)) continue;
  if (isDeniedPath(filePath)) {
    offenders.push({ filePath, reason: "denied path pattern" });
    continue;
  }
  if (!isTextFile(filePath)) continue;
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  const scan = scanContentForSecrets(content);
  if (scan.denied) offenders.push({ filePath, reason: scan.reason });
}

if (offenders.length > 0) {
  console.error(JSON.stringify({ level: "error", event: "secret_scan.failed", offenders }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ level: "info", event: "secret_scan.passed", scanned: tracked.length }));
