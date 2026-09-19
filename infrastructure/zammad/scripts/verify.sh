#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${ZAMMAD_BASE_URL:-http://localhost:8080}"

echo "Checking Zammad health at $BASE_URL"
curl -fsS "$BASE_URL/api/v1/signshow" >/dev/null && echo "OK: signshow reachable"

if [[ -n "${ZAMMAD_API_TOKEN:-}" ]]; then
  curl -fsS -H "Authorization: Token token=${ZAMMAD_API_TOKEN}" "$BASE_URL/api/v1/groups" >/dev/null
  echo "OK: API token can list groups"
else
  echo "SKIP: ZAMMAD_API_TOKEN not set"
fi
