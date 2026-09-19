#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

if ! ensure_graphify; then
  exit 1
fi

if ! graph_exists; then
  log "No graph yet — bootstrapping first..."
  bash "${SCRIPT_DIR}/bootstrap.sh"
fi

log "Watching repository for changes (Ctrl+C to stop)..."
graphify watch .
