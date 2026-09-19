# Zammad backup runbook

**Scope:** Dedicated Zammad VPS (`support-staging.yubie.id` / `support.yubie.id`)

## Prerequisites

- SSH access to Zammad VPS
- Pinned stack per [`infrastructure/zammad/zammad.lock.json`](../../infrastructure/zammad/zammad.lock.json)

## Backup procedure

```bash
cd /opt/zammad
./infrastructure/zammad/scripts/backup.sh
```

The script archives:

- Zammad PostgreSQL database
- Zammad file storage volume

Store artifacts off-host with encryption. Never commit backup files to Git.

## Verification

- Confirm backup file size > 0
- Record `backup_started_at`, `backup_completed_at`, `artifact_path` in [`M4_5_BACKUP_RESTORE_REPORT.md`](../../docs/development/execution/M4_5_BACKUP_RESTORE_REPORT.md)

## Schedule

- Staging: daily during validation window
- Production: daily minimum; retain per operator policy

## Alerts

- Backup job failure
- Disk pressure on backup destination
- Backup age > 26 hours (production)
