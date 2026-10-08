#!/usr/bin/env node
/**
 * Offline runtime-configuration validator (operator pre-flight check).
 *
 * Validates the current process environment (or an --env-file style shell you
 * source first) against the SAME fail-closed, service-scoped contracts
 * enforced at each service's startup by @yubie/config. Never contacts
 * Xendit, Zammad, WhatsApp, DNS, or any other network service, and never
 * prints secret values — only variable names.
 *
 * Usage:
 *   npm run config:validate
 *   set -a; source ./staging.env; set +a; npm run config:validate
 *   node scripts/validate-runtime-config.mjs --service bot   # single scope
 */
import { inspectServiceRuntimeConfig } from "@yubie/config";

const args = process.argv.slice(2);
const serviceFlag = args.indexOf("--service");
const singleService = serviceFlag !== -1 ? args[serviceFlag + 1] : null;
const services = singleService ? [singleService] : ["api", "worker", "bot"];

const failures = [];
const summaries = [];
for (const service of services) {
  const result = inspectServiceRuntimeConfig(process.env, service);
  if (result.ok) {
    const c = result.config;
    summaries.push({
      service,
      env: c.env,
      supportProvider: c.supportProvider,
      ...(c.commerce ? { commerceProvider: c.commerce.provider, inventoryMode: c.commerce.inventoryMode } : {}),
    });
  } else {
    failures.push({ service, errors: result.errors });
  }
}

if (failures.length === 0) {
  console.log(JSON.stringify({ level: "info", event: "config.validate.ok", services: summaries }, null, 2));
  process.exit(0);
}

console.error(JSON.stringify({ level: "error", event: "config.validate.failed", failures }, null, 2));
process.exit(1);
