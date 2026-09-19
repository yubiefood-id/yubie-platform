#!/usr/bin/env bash
# Shared helpers for Yubie Graphify workflow scripts.

set -euo pipefail

GRAPHIFY_DIR_NAME=".graphify"
GRAPHIFY_OUT="graphify-out"
GRAPH_JSON="${GRAPHIFY_OUT}/graph.json"
CHECKPOINT_FILE="${GRAPHIFY_DIR_NAME}/checkpoint.json"
HOOK_LOG="${GRAPHIFY_DIR_NAME}/logs/hooks.log"
IMPACT_REPORT="${GRAPHIFY_DIR_NAME}/reports/latest-impact.md"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

log() {
  echo "[graphify] $*"
}

log_hook() {
  mkdir -p "${REPO_ROOT}/${GRAPHIFY_DIR_NAME}/logs"
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") $*" >> "${REPO_ROOT}/${HOOK_LOG}"
}

graphify_available() {
  command -v graphify >/dev/null 2>&1
}

ensure_graphify() {
  if ! graphify_available; then
    log "graphify CLI not found on PATH — install with: uv tool install graphifyy"
    return 1
  fi
  return 0
}

has_llm_key() {
  [[ -n "${GEMINI_API_KEY:-}" || -n "${GOOGLE_API_KEY:-}" || -n "${ANTHROPIC_API_KEY:-}" || -n "${OPENAI_API_KEY:-}" ]]
}

graph_exists() {
  [[ -f "${REPO_ROOT}/${GRAPH_JSON}" ]]
}

read_checkpoint_sha() {
  local checkpoint="${REPO_ROOT}/${CHECKPOINT_FILE}"
  if [[ ! -f "$checkpoint" ]]; then
    echo ""
    return 0
  fi
  node -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync('${checkpoint}', 'utf8'));
      process.stdout.write(data.indexed_sha || '');
    } catch { process.stdout.write(''); }
  "
}

write_checkpoint() {
  local mode="$1"
  shift
  local changed_files=("$@")
  local sha
  sha="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo "unknown")"
  local version
  version="$(graphify --version 2>/dev/null | awk '{print $NF}' || echo "unknown")"
  local docs_semantic="false"
  if has_llm_key; then
    docs_semantic="true"
  fi

  mkdir -p "${REPO_ROOT}/${GRAPHIFY_DIR_NAME}"
  local tmp="${REPO_ROOT}/${CHECKPOINT_FILE}.tmp"
  node -e "
    const fs = require('fs');
    const payload = {
      indexed_sha: '${sha}',
      indexed_at: new Date().toISOString(),
      graphify_version: '${version}',
      changed_files: $(node -e "console.log(JSON.stringify(process.argv.slice(1)))" "${changed_files[@]}"),
      mode: '${mode}',
      docs_semantic: ${docs_semantic}
    };
    fs.writeFileSync('${tmp}', JSON.stringify(payload, null, 2) + '\n');
  "
  mv "${tmp}" "${REPO_ROOT}/${CHECKPOINT_FILE}"
}

is_engineering_file() {
  local file="$1"
  case "$file" in
    node_modules/*|*/dist/*|*/.next/*|coverage/*|.env*|*.pem|graphify-out/*|.graphify/*)
      return 1
      ;;
    apps/*|packages/*|infrastructure/*|docs/*|.github/*)
      return 0
      ;;
    AGENTS.md|DESIGN.md|README.md|package.json|package-lock.json|tsconfig*.json)
      return 0
      ;;
  esac
  return 1
}

get_changed_files_since_checkpoint() {
  local from_sha
  from_sha="$(read_checkpoint_sha)"
  local files=()

  if [[ -n "$from_sha" ]] && git -C "${REPO_ROOT}" rev-parse --verify "${from_sha}^{commit}" >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git -C "${REPO_ROOT}" diff --name-only "${from_sha}"..HEAD 2>/dev/null || true)
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git -C "${REPO_ROOT}" diff --name-only HEAD 2>/dev/null || true)
    while IFS= read -r line; do
      [[ -n "$line" ]] && files+=("$line")
    done < <(git -C "${REPO_ROOT}" ls-files --others --exclude-standard 2>/dev/null || true)
  fi

  local filtered=()
  local f
  for f in "${files[@]}"; do
    if is_engineering_file "$f"; then
      filtered+=("$f")
    fi
  done

  if ((${#filtered[@]} == 0)); then
    return 0
  fi
  printf '%s\n' "${filtered[@]}"
}

get_hook_changed_files() {
  local mode="${1:-commit}"
  local files=()

  case "$mode" in
    merge)
      while IFS= read -r line; do
        [[ -n "$line" ]] && files+=("$line")
      done < <(git -C "${REPO_ROOT}" diff --name-only ORIG_HEAD HEAD 2>/dev/null || true)
      ;;
    checkout)
      while IFS= read -r line; do
        [[ -n "$line" ]] && files+=("$line")
      done < <(git -C "${REPO_ROOT}" diff --name-only HEAD@{1} HEAD 2>/dev/null || true)
      ;;
    *)
      while IFS= read -r line; do
        [[ -n "$line" ]] && files+=("$line")
      done < <(git -C "${REPO_ROOT}" diff --name-only HEAD~1 HEAD 2>/dev/null || git -C "${REPO_ROOT}" diff --name-only HEAD 2>/dev/null || true)
      ;;
  esac

  local filtered=()
  local f
  for f in "${files[@]}"; do
    if is_engineering_file "$f"; then
      filtered+=("$f")
    fi
  done

  if ((${#filtered[@]} == 0)); then
    return 0
  fi
  printf '%s\n' "${filtered[@]}"
}

classify_file() {
  local file="$1"
  local views=()

  [[ "$file" == apps/api/* || "$file" == packages/integrations/* || "$file" == packages/application/* ]] && views+=("contracts")
  [[ "$file" == *webhook* || "$file" == */ports/* ]] && views+=("contracts")
  [[ "$file" == infrastructure/* || "$file" == *docker-compose* || "$file" == *Dockerfile* ]] && views+=("infrastructure")
  [[ "$file" == apps/* || "$file" == packages/* ]] && views+=("boundaries")
  [[ "$file" == packages/persistence/migrations/* || "$file" == packages/persistence/src/* ]] && views+=("database")
  [[ "$file" == *verif* || "$file" == *auth* || "$file" == *security* ]] && views+=("security")
  [[ "$file" == apps/api/* ]] && views+=("security")
  [[ "$file" == */tests/* || "$file" == *.test.mjs ]] && views+=("tests")
  [[ "$file" == docs/* || "$file" == *ADR-* ]] && views+=("documentation")

  if ((${#views[@]} == 0)); then
    return 0
  fi

  local seen=""
  local v
  for v in "${views[@]}"; do
    if [[ "$seen" != *"|$v|"* ]]; then
      echo "$v"
      seen="${seen}|$v|"
    fi
  done
}

get_view_query() {
  local view="$1"
  node -e "
    const fs = require('fs');
    const yaml = fs.readFileSync('${REPO_ROOT}/.graphify/config.yml', 'utf8');
    const block = yaml.split(/^  ${view}:/m)[1];
    if (!block) process.exit(1);
    const match = block.match(/query: \"([^\"]+)\"/);
    if (match) process.stdout.write(match[1]);
  " 2>/dev/null || true
}

git_operation_in_progress() {
  local git_dir
  git_dir="$(git -C "${REPO_ROOT}" rev-parse --git-dir 2>/dev/null || echo "")"
  [[ -z "$git_dir" ]] && return 1
  [[ -d "${REPO_ROOT}/${git_dir}/rebase-merge" || -d "${REPO_ROOT}/${git_dir}/rebase-apply" ]] && return 0
  [[ -f "${REPO_ROOT}/${git_dir}/MERGE_HEAD" || -f "${REPO_ROOT}/${git_dir}/CHERRY_PICK_HEAD" ]] && return 0
  return 1
}

run_in_background() {
  local script="$1"
  shift
  nohup bash "$script" "$@" >> "${REPO_ROOT}/${HOOK_LOG}" 2>&1 &
}
