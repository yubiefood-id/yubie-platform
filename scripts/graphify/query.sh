#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

VIEW=""
QUESTION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --view)
      VIEW="$2"
      shift 2
      ;;
    *)
      QUESTION="$1"
      shift
      ;;
  esac
done

if ! ensure_graphify; then
  exit 1
fi

if ! graph_exists; then
  log "No graph — run: npm run graph:bootstrap"
  exit 1
fi

if [[ -n "$VIEW" && -z "$QUESTION" ]]; then
  QUESTION="$(get_view_query "$VIEW")"
fi

if [[ -z "$QUESTION" ]]; then
  log "Usage: npm run graph:query -- \"<question>\""
  log "       npm run graph:query -- --view contracts"
  log ""
  log "Preset views: contracts infrastructure boundaries database security tests documentation"
  exit 1
fi

graphify query "$QUESTION" --budget 3000 --graph "${GRAPH_JSON}"
