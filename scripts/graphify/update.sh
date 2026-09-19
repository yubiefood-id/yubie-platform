#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

HOOK_MODE=false
HOOK_TYPE="commit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hook)
      HOOK_MODE=true
      shift
      ;;
    --merge)
      HOOK_TYPE="merge"
      shift
      ;;
    --checkout)
      HOOK_TYPE="checkout"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

cd "${REPO_ROOT}"

if ! graphify_available; then
  if $HOOK_MODE; then
    log_hook "skipped: graphify not on PATH"
    exit 0
  fi
  log "graphify CLI not found on PATH"
  exit 1
fi

if ! graph_exists; then
  if $HOOK_MODE; then
    log_hook "skipped: no graph yet (run npm run graph:bootstrap)"
    exit 0
  fi
  log "No graph found — running bootstrap..."
  exec bash "${SCRIPT_DIR}/bootstrap.sh"
fi

if $HOOK_MODE && git_operation_in_progress; then
  log_hook "skipped: git operation in progress"
  exit 0
fi

mapfile -t changed < <(get_hook_changed_files "$HOOK_TYPE")
if $HOOK_MODE && ((${#changed[@]} == 0)); then
  log_hook "skipped: no engineering files changed"
  exit 0
fi

log "Running incremental graph update..."
if ! graphify update .; then
  if $HOOK_MODE; then
    log_hook "update failed — checkpoint not advanced"
    exit 0
  fi
  log "graphify update failed — checkpoint not advanced"
  exit 1
fi

if ((${#changed[@]} == 0)); then
  mapfile -t changed < <(get_changed_files_since_checkpoint)
fi

mode="incremental"
if $HOOK_MODE; then
  mode="hook"
fi

write_checkpoint "$mode" "${changed[@]}"
bash "${SCRIPT_DIR}/impact-report.sh"

if $HOOK_MODE; then
  log_hook "incremental update succeeded (${#changed[@]} files)"
else
  log "Update complete (${#changed[@]} changed files tracked)"
fi
