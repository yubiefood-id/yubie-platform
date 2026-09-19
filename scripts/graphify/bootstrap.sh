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

docs_semantic=false
if has_llm_key; then
  log "API key detected — indexing docs with semantic extraction..."
  graphify update docs/ || log "Docs semantic update skipped or partial"
  docs_semantic=true
else
  log "No LLM API key — docs remain path-indexed only until graph:update with a key"
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  log "DATABASE_URL set — extracting live PostgreSQL schema..."
  graphify extract --postgres "${DATABASE_URL}" || log "Postgres schema extraction skipped"
fi

mapfile -t changed < <(git diff --name-only HEAD 2>/dev/null || true)
write_checkpoint "bootstrap" "${changed[@]}"

bash "${SCRIPT_DIR}/impact-report.sh"

log "Bootstrap complete. Graph at ${GRAPH_JSON}"
