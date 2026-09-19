#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

log "=== Yubie engineering context ==="

log "1. Git state"
git rev-parse --short HEAD 2>/dev/null || true
git diff --stat HEAD 2>/dev/null | tail -15 || true

log "2. Incremental AST update"
bash "${SCRIPT_DIR}/update.sh" --ast-only || true

log "3. Semantic extraction (changed P0/P1, cached skips)"
node "${SCRIPT_DIR}/cursor-semantic.mjs" --limit 5 --p1 2>/dev/null || true

log "4. Merge engineering graph"
(cd "${SCRIPT_DIR}" && node --input-type=module -e "import { mergeEngineeringGraph } from './semantic-merge.mjs'; console.log(JSON.stringify(mergeEngineeringGraph()));") 2>/dev/null || true

log "5. Doctor"
bash "${SCRIPT_DIR}/doctor.sh" || true

log "6. Impact report v2"
node "${SCRIPT_DIR}/impact-report.mjs" || true

echo ""
if [[ -f "${IMPACT_REPORT}" ]]; then
  log "Impact summary:"
  head -80 "${IMPACT_REPORT}"
  echo ""
fi

QGRAPH="$(query_graph_path)"
if [[ -n "$QGRAPH" ]] && graphify_available; then
  log "7. Architecture query"
  graphify query "What are the current support authority, provider boundaries, and affected components?" --budget 2500 --graph "${QGRAPH}" 2>/dev/null || true
fi

log "=== End context ==="
