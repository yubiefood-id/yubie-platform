#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

if ! ensure_graphify; then
  exit 1
fi

log "Bootstrapping engineering graph (code-first, offline AST)..."
graphify extract . --code-only --no-viz

if [[ -n "${DATABASE_URL:-}" ]]; then
  log "DATABASE_URL set — extracting live PostgreSQL schema..."
  graphify extract --postgres "${DATABASE_URL}" || log "Postgres schema extraction skipped"
fi

mapfile -t changed < <(git diff --name-only HEAD 2>/dev/null || true)
write_code_checkpoint "bootstrap" "${changed[@]}"

node "${SCRIPT_DIR}/impact-report.mjs"

log "Bootstrap complete. Graph at ${GRAPH_JSON}"
log "Run npm run graph:semantic-bootstrap to index P0 docs via Cursor (no external API keys)."
