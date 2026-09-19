# Zammad restore runbook

**Scope:** Staging restore drill and production disaster recovery

## Staging restore drill

```bash
cd /opt/zammad
./infrastructure/zammad/scripts/restore-test.sh /path/to/backup.tar.gz
./infrastructure/zammad/scripts/verify.sh
```

## Elasticsearch

Elasticsearch indices can be rebuilt per [official Zammad documentation](https://docs.zammad.org/). After Postgres + file restore:

1. Confirm Zammad app health via `verify.sh`
2. If search is degraded, run Zammad ES rebuild procedure from official docs
3. Record rebuild duration in backup/restore report

## Yubie Postgres (separate)

Yubie `webhook_inbox`, `assistant_outbox`, and `conversation_sessions` live on the **core Yubie VPS**, not the Zammad VPS. Restore both stacks independently.

## Success criteria

- Zammad UI loads over HTTPS
- API token can list groups
- At least one test ticket readable
- WhatsApp channel configuration intact (verify in admin UI)

## Record evidence

Update [`M4_5_BACKUP_RESTORE_REPORT.md`](../../docs/development/execution/M4_5_BACKUP_RESTORE_REPORT.md) with measured restore duration and integrity checks.
