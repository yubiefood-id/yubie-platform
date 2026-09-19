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

if agent_available; then
  log "Cursor agent: $(agent --version 2>/dev/null || echo unknown)"
else
  warn "Cursor agent CLI not on PATH (semantic indexing degraded)"
fi

QGRAPH="$(query_graph_path)"
if [[ -n "$QGRAPH" ]]; then
  nodes_edges="$(node -e "
    const fs = require('fs');
    const g = JSON.parse(fs.readFileSync('${REPO_ROOT}/${QGRAPH}', 'utf8'));
    const nodes = Array.isArray(g.nodes) ? g.nodes.length : Object.keys(g.nodes || {}).length;
    const edges = Array.isArray(g.links) ? g.links.length : (g.edges || []).length;
    console.log(nodes + ' nodes, ' + edges + ' edges');
  " 2>/dev/null || echo "unknown")"
  log "Query graph: ${QGRAPH} (${nodes_edges})"
else
  warn "No graph — run: npm run graph:bootstrap"
fi

if [[ -f "${REPO_ROOT}/${SEMANTIC_GRAPH}" ]]; then
  log "Semantic graph: present"
else
  warn "No semantic graph — run: npm run graph:semantic-bootstrap"
fi

if [[ -f "${CHECKPOINT_FILE}" ]]; then
  node -e "
    const fs=require('fs');
    const d=JSON.parse(fs.readFileSync('${REPO_ROOT}/${CHECKPOINT_FILE}','utf8'));
    const head=require('child_process').execSync('git rev-parse HEAD',{cwd:'${REPO_ROOT}',encoding:'utf8'}).trim();
    console.log('[graphify] Freshness:', d.freshness_status||'unknown');
    console.log('[graphify] Code SHA:', (d.code_index_sha||d.indexed_sha||'').slice(0,8), 'HEAD:', head.slice(0,8));
    console.log('[graphify] Semantic SHA:', (d.semantic_index_sha||'').slice(0,8));
    console.log('[graphify] Semantic provider:', d.semantic_provider||'none');
    console.log('[graphify] Semantic dirty:', (d.semantic_dirty_files||[]).length);
  " 2>/dev/null || warn "Could not read checkpoint"
else
  warn "No checkpoint file"
fi

if graphify_available && [[ -f "${REPO_ROOT}/${GRAPH_JSON}" ]]; then
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
