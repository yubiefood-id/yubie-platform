#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [workerPath, hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

# Client-bundle secret scan: no server-only env name may leak into dist/client.
# Covers API_PROXY_TOKEN, XENDIT_*, ZAMMAD_*, OPS_API_TOKEN, DATABASE_URL.
leak=$(grep -rEl "API_PROXY_TOKEN|XENDIT_SECRET_KEY|XENDIT_WEBHOOK_TOKEN|OPS_API_TOKEN|ZAMMAD_API_TOKEN|postgresql://" \
  "${SITES_PROJECT_ROOT}/dist/client" 2>/dev/null || true)
if [[ -n "${leak}" ]]; then
  echo "Server-only secrets leaked into the client bundle:" >&2
  echo "${leak}" >&2
  exit 78
fi

echo "Validated Sites artifact: ESM Worker default.fetch, hosting manifest, and a secret-free client bundle."
