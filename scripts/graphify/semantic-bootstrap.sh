#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

LIMIT=5
EXTRA_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --p1)
      EXTRA_ARGS+=(--p1)
      shift
      ;;
    --force)
      EXTRA_ARGS+=(--force)
      shift
      ;;
    *)
      shift
      ;;
  esac
done

cd "${REPO_ROOT}"

log "Semantic bootstrap (Cursor-native, batch limit=${LIMIT})..."
node "${SCRIPT_DIR}/cursor-semantic.mjs" --all-p0 --limit "${LIMIT}" "${EXTRA_ARGS[@]:-}"

log "Semantic bootstrap batch complete. Re-run until P0 corpus is indexed, or use npm run graph:context."
