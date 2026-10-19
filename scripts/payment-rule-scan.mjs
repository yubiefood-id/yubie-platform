#!/usr/bin/env node
/**
 * CI gate for .semgrep/payment.yml. Runs the same two rules without installing
 * Semgrep. An operator with the pinned Semgrep CLI can run:
 *   semgrep --config .semgrep/payment.yml --error
 * This script also checks that iPaymu session creation performs one POST.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const sourceRoots = ["apps", "packages"];
const hostRule = /https:\/\/(my|live)\.ipaymu\.com/;
const envRule = /IPAYMU_ENV\s*[:=]\s*["']production["']/;
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "tests") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|js|mjs)$/.test(entry)) continue;
    const text = readFileSync(full, "utf8");
    const rel = relative(root, full);
    if (hostRule.test(text)) offenders.push({ file: rel, rule: "yubie-ipaymu-production-host" });
    if (envRule.test(text)) offenders.push({ file: rel, rule: "yubie-ipaymu-production-env" });
  }
}

for (const dir of sourceRoots) walk(join(root, dir));

const providerPath = join(root, "packages/integrations/src/ipaymu/ipaymu-payment-provider.ts");
const provider = readFileSync(providerPath, "utf8");
const start = provider.indexOf("async createPaymentSession");
const next = provider.indexOf("async getPaymentSession");
const body = start >= 0 && next > start ? provider.slice(start, next) : "";
const fetches = body.match(/this\.fetchFn\s*\(/g) ?? [];
if (fetches.length !== 1) {
  offenders.push({ file: "packages/integrations/src/ipaymu/ipaymu-payment-provider.ts", rule: "single-payment-post", fetches: fetches.length });
}

if (offenders.length > 0) {
  console.error(JSON.stringify({ level: "error", event: "payment_scan.failed", offenders }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ level: "info", event: "payment_scan.passed", rules: [".semgrep/payment.yml", "single-payment-post"] }));
