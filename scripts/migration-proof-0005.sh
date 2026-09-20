#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${MIGRATION_PROOF_CONTAINER:-yubie-m5-migration-proof}"
IMAGE="${MIGRATION_PROOF_IMAGE:-postgres:16-alpine}"
PORT="${MIGRATION_PROOF_PORT:-55432}"
DATABASE_URL="postgresql://yubie:yubie_local@127.0.0.1:${PORT}/yubie_migration_proof"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[migration-proof] starting ephemeral postgres on port ${PORT}"
docker run --rm -d --name "$CONTAINER" -e POSTGRES_USER=yubie -e POSTGRES_PASSWORD=yubie_local -e POSTGRES_DB=yubie_migration_proof -p "${PORT}:5432" "$IMAGE" >/dev/null

for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U yubie -d yubie_migration_proof >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "[migration-proof] postgres did not become ready" >&2
    exit 1
  fi
done

echo "[migration-proof] running migration 0005 tests"
DATABASE_URL="$DATABASE_URL" npm run build --workspace @yubie/persistence && \
DATABASE_URL="$DATABASE_URL" node --test packages/persistence/tests/migration-0005.test.mjs

echo "[migration-proof] PASS fresh + upgrade scenarios"
echo "DATABASE_URL=${DATABASE_URL}"
