#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

if ! ensure_graphify; then
  exit 1
fi

if ! [[ -f "${REPO_ROOT}/${GRAPH_JSON}" ]]; then
  log "No graph yet — bootstrapping first..."
  bash "${SCRIPT_DIR}/bootstrap.sh"
fi

log "Starting Yubie Graphify session watcher..."
exec node "${SCRIPT_DIR}/watcher.mjs"
