# M4.5 Backup / Restore Report

**Date:** 2026-09-20  
**Status:** BLOCKED_EXTERNAL

## Scripts available

| Script | Purpose |
|--------|---------|
| `infrastructure/zammad/scripts/backup.sh` | Zammad PG + file storage archive |
| `infrastructure/zammad/scripts/restore-test.sh` | Restore drill |
| Core Yubie Postgres | Operator-managed (`pg_dump` / `pg_restore`) |

## Drill results

| Stack | Backup duration | Restore duration | Integrity | Status |
|-------|-----------------|------------------|-----------|--------|
| Zammad Postgres + files | Not measured | Not measured | Not verified | PENDING |
| Yubie Postgres | Not measured | Not measured | Not verified | PENDING |
| Elasticsearch | N/A — rebuild per Zammad docs | Not measured | PENDING |

## RTO/RPO

Not declared — requires measured drill on staging VPS.

## Operator procedure

See [`zammad-backup.md`](../../production/runbooks/zammad-backup.md) and [`zammad-restore.md`](../../production/runbooks/zammad-restore.md).
