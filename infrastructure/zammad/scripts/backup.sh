#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/zammad}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

echo "Zammad backup placeholder — run on Zammad VPS with compose project name zammad"
echo "  docker compose exec -T zammad-postgresql pg_dump -U zammad zammad > $BACKUP_DIR/zammad-$TIMESTAMP.sql"
echo "  docker run --rm -v zammad-storage:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/zammad-storage-$TIMESTAMP.tgz /data"
