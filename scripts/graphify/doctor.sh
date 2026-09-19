#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

warnings=0
errors=0

warn() {
  log "WARN: $*"
  warnings=$((warnings + 1))
}

fail() {
  log "ERROR: $*"
  errors=$((errors + 1))
}

log "=== Graphify doctor ==="

if graphify_available; then
  log "CLI: $(graphify --version 2>/dev/null || echo unknown)"
else
  fail "graphify CLI not on PATH"
fi

if graph_exists; then
  nodes_edges="$(node -e "
    const fs = require('fs');
    const g = JSON.parse(fs.readFileSync('${REPO_ROOT}/${GRAPH_JSON}', 'utf8'));
    const nodes = Array.isArray(g.nodes) ? g.nodes.length : Object.keys(g.nodes || {}).length;
    const edges = Array.isArray(g.edges) ? g.edges.length : (g.links || []).length;
    console.log(nodes + ' nodes, ' + edges + ' edges');
  " 2>/dev/null || echo "unknown")"
  log "Graph: ${GRAPH_JSON} (${nodes_edges})"
else
  warn "No graph at ${GRAPH_JSON} — run: npm run graph:bootstrap"
fi

if [[ -f "${CHECKPOINT_FILE}" ]]; then
  checkpoint_sha="$(read_checkpoint_sha)"
  head_sha="$(git rev-parse HEAD 2>/dev/null || echo "")"
  if [[ -n "$checkpoint_sha" && -n "$head_sha" && "$checkpoint_sha" != "$head_sha" ]]; then
    warn "Checkpoint SHA (${checkpoint_sha:0:8}) differs from HEAD (${head_sha:0:8}) — graph may be stale"
  else
    log "Checkpoint: aligned with HEAD (${checkpoint_sha:0:8})"
  fi
else
  warn "No checkpoint file — run graph:update after bootstrap"
fi

if graphify_available && graph_exists; then
  if graphify check-update . 2>&1 | grep -qi "needs_update\|pending\|stale"; then
    warn "graphify check-update reports pending semantic re-extraction"
  else
    log "check-update: OK"
  fi
fi

if [[ -f "${IMPACT_REPORT}" ]]; then
  log "Impact report: ${IMPACT_REPORT}"
else
  warn "No impact report yet"
fi

log "=== Summary: ${errors} error(s), ${warnings} warning(s) ==="

if ((errors > 0)); then
  exit 1
fi
exit 0
