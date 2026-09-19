#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"

chmod +x "${REPO_ROOT}/.githooks/"* 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/"*.sh "${SCRIPT_DIR}/lib/"*.sh 2>/dev/null || true

git config core.hooksPath .githooks

log "Git hooks path set to .githooks (local repo config only)"
log "Hooks: post-commit, post-merge, post-checkout"
log "Opt out anytime: GRAPHIFY_SKIP_HOOK=1"
