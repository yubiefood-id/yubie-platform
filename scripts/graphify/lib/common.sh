#!/usr/bin/env bash
# Shared helpers for Yubie Graphify workflow scripts.

set -euo pipefail

GRAPHIFY_DIR_NAME=".graphify"
GRAPHIFY_OUT="graphify-out"
GRAPH_JSON="${GRAPHIFY_OUT}/graph.json"
SEMANTIC_GRAPH="${GRAPHIFY_OUT}/semantic.json"
ENGINEERING_GRAPH="${GRAPHIFY_OUT}/engineering-graph.json"
CHECKPOINT_FILE="${GRAPHIFY_DIR_NAME}/checkpoint.json"
HOOK_LOG="${GRAPHIFY_DIR_NAME}/logs/hooks.log"
IMPACT_REPORT="${GRAPHIFY_DIR_NAME}/reports/latest-impact.md"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

agent_available() {
  command -v agent >/dev/null 2>&1
}

ensure_graphify() {
  if ! graphify_available; then
    log "graphify CLI not found on PATH — install with: uv tool install graphifyy"
    return 1
  fi
  return 0
}

query_graph_path() {
  if [[ -f "${REPO_ROOT}/${ENGINEERING_GRAPH}" ]]; then
    echo "${ENGINEERING_GRAPH}"
  elif [[ -f "${REPO_ROOT}/${GRAPH_JSON}" ]]; then
    echo "${GRAPH_JSON}"
  else
    echo ""
  fi
}

graph_exists() {
  [[ -n "$(query_graph_path)" ]]
}

read_checkpoint_sha() {
  node -e "
    const fs=require('fs');
    const p='${REPO_ROOT}/${CHECKPOINT_FILE}';
    if(!fs.existsSync(p)) process.exit(0);
    const d=JSON.parse(fs.readFileSync(p,'utf8'));
    process.stdout.write(d.code_index_sha||d.indexed_sha||'');
  " 2>/dev/null || true
}

write_code_checkpoint() {
  local mode="$1"
  shift
  local changed_files=("$@")
  node --input-type=module -e "
    import fs from 'node:fs';
    import { execSync } from 'node:child_process';
    import { computeFreshnessStatus } from './checkpoint.mjs';
    const cp='${REPO_ROOT}/${CHECKPOINT_FILE}';
    let d={};
    try{d=JSON.parse(fs.readFileSync(cp,'utf8'))}catch{}
    const sha=execSync('git rev-parse HEAD',{cwd:'${REPO_ROOT}',encoding:'utf8'}).trim();
    let gv='unknown';
    try{gv=execSync('graphify --version',{encoding:'utf8'}).trim().split(' ').pop()}catch{}
    Object.assign(d,{
      code_index_sha:sha,
      code_indexed_at:new Date().toISOString(),
      indexed_sha:sha,
      indexed_at:new Date().toISOString(),
      graphify_version:gv,
      changed_files:$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" "${changed_files[@]}"),
      mode:'${mode}'
    });
    d.freshness_status=computeFreshnessStatus(d);
    fs.mkdirSync('${REPO_ROOT}/${GRAPHIFY_DIR_NAME}',{recursive:true});
    const tmp=cp+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(d,null,2)+'\n');
    fs.renameSync(tmp,cp);
  " --cwd "${SCRIPT_DIR}"
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

is_semantic_doc() {
  local file="$1"
  [[ "$file" == *.md ]] || [[ "$file" == AGENTS.md || "$file" == DESIGN.md || "$file" == README.md ]]
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

mark_semantic_dirty_files() {
  local files=("$@")
  if ((${#files[@]} == 0)); then return 0; fi
  node "${SCRIPT_DIR}/mark-dirty.mjs" "${files[@]}" 2>/dev/null || true
}
