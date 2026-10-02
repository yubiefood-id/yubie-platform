#!/usr/bin/env bash
# Yubie transactional DB backup (docs/production/vps/04_POSTGRES_BACKUP_PITR.md).
#
# What this script implements TODAY (verifiable, no external credentials):
#   - nightly pg_dump (custom format, -Fc) of the Yubie database
#   - local retention window (default 14 daily dumps)
#   - checksum per dump
#
# What is deliberately NOT claimed:
#   - PITR (base backup + continuous WAL archive) requires an off-host,
#     encrypted storage target that does not exist yet. RPO <= 15 min is NOT
#     met by pg_dump alone. See RESTORE.md; treat PITR as BLOCKED_EXTERNAL
#     until the storage target is provisioned.
#
# Required environment:
#   DATABASE_URL            postgres:// connection string (never committed)
#   YUBIE_BACKUP_DIR        writable local directory for dumps
# Optional:
#   YUBIE_BACKUP_RETENTION  number of dumps to keep (default 14)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${YUBIE_BACKUP_DIR:?YUBIE_BACKUP_DIR is required}"
RETENTION="${YUBIE_BACKUP_RETENTION:-14}"

mkdir -p "$YUBIE_BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$YUBIE_BACKUP_DIR/yubie-$STAMP.dump"

echo "{\"event\":\"backup.started\",\"at\":\"$STAMP\"}"
pg_dump --format=custom --file="$DUMP" "$DATABASE_URL"
sha256sum "$DUMP" > "$DUMP.sha256"
echo "{\"event\":\"backup.completed\",\"file\":\"$DUMP\",\"bytes\":\"$(stat -c%s "$DUMP")\"}"

# Retention: keep the newest $RETENTION dump+checksum pairs.
ls -1t "$YUBIE_BACKUP_DIR"/yubie-*.dump 2>/dev/null | tail -n +$((RETENTION + 1)) | while read -r old; do
  rm -f "$old" "$old.sha256"
  echo "{\"event\":\"backup.pruned\",\"file\":\"$old\"}"
done

# Off-host upload: intentionally absent until the encrypted storage target is
# provisioned (see docs/production/vps/04 §off-host). A local-only backup is
# not a backup against host loss.
if [ ! -d "$YUBIE_BACKUP_DIR" ] || [ -z "$(ls -A "$YUBIE_BACKUP_DIR" 2>/dev/null)" ]; then
  echo "{\"event\":\"backup.empty_warning\"}"
fi
