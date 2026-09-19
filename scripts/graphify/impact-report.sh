#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

cd "${REPO_ROOT}"
mkdir -p "${GRAPHIFY_DIR_NAME}/reports"

mapfile -t changed < <(get_changed_files_since_checkpoint)
if ((${#changed[@]} == 0)); then
  mapfile -t changed < <(git diff --name-only HEAD 2>/dev/null || true)
fi

declare -A view_files
declare -A view_counts

for file in "${changed[@]}"; do
  [[ -z "$file" ]] && continue
  while IFS= read -r view; do
    [[ -z "$view" ]] && continue
    view_files["$view"]+="- ${file}\n"
    view_counts["$view"]=$((${view_counts[$view]:-0} + 1))
  done < <(classify_file "$file")
done

report="${REPO_ROOT}/${IMPACT_REPORT}"
{
  echo "# Graphify Impact Report"
  echo ""
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ") UTC"
  echo "HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo ""
  echo "## Changed files"
  echo ""
  if ((${#changed[@]} == 0)); then
    echo "_No engineering file changes detected since last checkpoint._"
  else
    for file in "${changed[@]}"; do
      echo "- \`${file}\`"
    done
  fi
  echo ""
  echo "## Views affected"
  echo ""
  if ((${#view_counts[@]} == 0)); then
    echo "_No view classification for current changes._"
  else
    echo "| View | Files |"
    echo "|------|-------|"
    for view in contracts infrastructure boundaries database security tests documentation; do
      count="${view_counts[$view]:-0}"
      if ((count > 0)); then
        echo "| ${view} | ${count} |"
      fi
    done
  fi
  echo ""

  for view in contracts infrastructure boundaries database security tests documentation; do
    count="${view_counts[$view]:-0}"
    if ((count == 0)); then
      continue
    fi
    echo "## ${view}"
    echo ""
    printf "%b" "${view_files[$view]}"
    echo ""
  done

  if graph_exists && graphify_available; then
    echo "## Graph queries (evidence-based)"
    echo ""
    query_count=0
    for view in contracts infrastructure boundaries database security tests documentation; do
      count="${view_counts[$view]:-0}"
      if ((count == 0 || query_count >= 3)); then
        continue
      fi
      q="$(get_view_query "$view")"
      if [[ -z "$q" ]]; then
        continue
      fi
      echo "### ${view}"
      echo ""
      echo "> ${q}"
      echo ""
      graphify query "$q" --budget 1500 --graph "${GRAPH_JSON}" 2>/dev/null | sed 's/^/> /' || echo "> _Query unavailable_"
      echo ""
      query_count=$((query_count + 1))
    done
  fi
} > "${report}.tmp"

mv "${report}.tmp" "${report}"
log "Impact report: ${IMPACT_REPORT}"
