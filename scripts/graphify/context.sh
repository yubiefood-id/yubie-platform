#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

log "=== Yubie engineering context ==="

bash "${SCRIPT_DIR}/update.sh" || true
bash "${SCRIPT_DIR}/doctor.sh" || true

echo ""
log "Git diff (working tree):"
git diff --stat HEAD 2>/dev/null | tail -20 || true

echo ""
if [[ -f "${IMPACT_REPORT}" ]]; then
  log "Impact report:"
  head -60 "${IMPACT_REPORT}"
  echo ""
fi

if graph_exists && graphify_available; then
  log "Quick graph query — current branch impact:"
  graphify query "What components, contracts, and tests are affected by recent changes in this repository?" --budget 2000 --graph "${GRAPH_JSON}" 2>/dev/null || true
fi

log "=== End context ==="
