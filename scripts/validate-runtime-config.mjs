#!/usr/bin/env node
/**
 * Offline runtime-configuration validator (operator pre-flight check).
 *
 * Validates the current process environment (or an --env-file style shell you
 * source first) against the same fail-closed contract enforced at service
 * startup by @yubie/config. Never contacts Zammad, WhatsApp, DNS, or any other
 * network service, and never prints secret values — only variable names.
 *
 * Usage:
 *   npm run config:validate
 *   set -a; source ./staging.env; set +a; npm run config:validate
 */
import { inspectRuntimeConfig } from "@yubie/config";

const result = inspectRuntimeConfig(process.env);

if (result.ok) {
  const c = result.config;
  console.log(
    JSON.stringify(
      {
        level: "info",
        event: "config.validate.ok",
        env: c.env,
        botEngine: c.botEngine,
        supportProvider: c.supportProvider,
        supportProviderSource: c.supportProviderSource,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.error(
  JSON.stringify({ level: "error", event: "config.validate.failed", errors: result.errors }, null, 2),
);
process.exit(1);
