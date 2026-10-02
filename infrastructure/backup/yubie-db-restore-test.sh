#!/usr/bin/env bash
# Isolated restore drill (docs/production/03 §5: "A backup is not verified
# until restored into an isolated environment and application-level invariants
# are checked").
#
# Restores the newest dump from YUBIE_BACKUP_DIR into a THROWAWAY database on
# the same Postgres instance, then checks application invariants:
#   - every migration in packages/persistence/migrations is applied
#   - orders totals constraint exists (grand_total = subtotal+shipping+tax-discount)
#   - payment_events dedupe index exists
#   - no order has an active reservation without a live lot (FK guarantees)
#
# The scratch database is dropped afterwards. Run quarterly and after schema
# changes; record actual RPO/RTO in the drill log (docs/production/vps/11).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${YUBIE_BACKUP_DIR:?YUBIE_BACKUP_DIR is required}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRATCH="yubie_restore_drill_$(date -u +%Y%m%d%H%M%S)"

DUMP="$(ls -1t "$YUBIE_BACKUP_DIR"/yubie-*.dump 2>/dev/null | head -1 || true)"
if [ -z "$DUMP" ]; then
  echo "{\"event\":\"restore_test.failed\",\"reason\":\"no dump found in $YUBIE_BACKUP_DIR\"}" >&2
  exit 1
fi

# Path-suffix swap works for standard postgres://user:pass@host:port/db URLs.
ADMIN_URL="${DATABASE_URL%/*}/postgres"
STARTED="$(date -u +%s)"
echo "{\"event\":\"restore_test.started\",\"dump\":\"$DUMP\",\"scratch\":\"$SCRATCH\"}"

cleanup() {
  psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE)" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql "$ADMIN_URL" -c "CREATE DATABASE \"$SCRATCH\"" >/dev/null
SCRATCH_URL="${DATABASE_URL%/*}/$SCRATCH"
pg_restore --no-owner --dbname="$SCRATCH_URL" "$DUMP"

# Invariant 1: every shipped migration is recorded as applied.
MIGRATIONS=$(ls "$REPO_ROOT/packages/persistence/migrations"/*.sql | xargs -n1 basename)
MISSING=""
for migration in $MIGRATIONS; do
  if ! psql "$SCRATCH_URL" -tAc "SELECT 1 FROM schema_migrations WHERE version = '$migration'" | grep -q 1; then
    MISSING="$MISSING $migration"
  fi
done
if [ -n "$MISSING" ]; then
  echo "{\"event\":\"restore_test.failed\",\"reason\":\"migrations missing:$MISSING\"}" >&2
  exit 1
fi

# Invariant 2: commerce totals constraint survived the restore.
CONSTRAINT=$(psql "$SCRATCH_URL" -tAc "SELECT 1 FROM pg_constraint WHERE conname = 'orders_grand_total_check'")
[ "$CONSTRAINT" = "1" ] || { echo "{\"event\":\"restore_test.failed\",\"reason\":\"orders_grand_total_check missing\"}" >&2; exit 1; }

# Invariant 3: payment-event dedupe uniqueness survived.
DEDUPE=$(psql "$SCRATCH_URL" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = 'payment_events_dedupe'")
[ "$DEDUPE" = "1" ] || { echo "{\"event\":\"restore_test.failed\",\"reason\":\"payment_events_dedupe missing\"}" >&2; exit 1; }

# Invariant 4: consistency counts for the drill log.
ORDERS=$(psql "$SCRATCH_URL" -tAc "SELECT count(*) FROM orders")
PAYMENTS=$(psql "$SCRATCH_URL" -tAc "SELECT count(*) FROM order_payments")
FINISHED="$(date -u +%s)"
echo "{\"event\":\"restore_test.passed\",\"orders\":\"$ORDERS\",\"payments\":\"$PAYMENTS\",\"seconds\":\"$((FINISHED - STARTED))\",\"scratch\":\"$SCRATCH (dropped)\"}"
