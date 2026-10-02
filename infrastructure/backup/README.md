# Yubie DB backup & restore drill

Implements the local half of `docs/production/vps/04_POSTGRES_BACKUP_PITR.md`.

## Scripts

- `yubie-db-backup.sh` — nightly `pg_dump -Fc` + sha256 + retention window
  (`YUBIE_BACKUP_RETENTION`, default 14). Needs `DATABASE_URL` and
  `YUBIE_BACKUP_DIR`.
- `yubie-db-restore-test.sh` — restores the newest dump into a throwaway
  database, verifies application invariants (all migrations applied,
  `orders_grand_total_check`, `payment_events_dedupe`), prints order/payment
  counts, drops the scratch database. Run quarterly and after schema changes;
  record actual RPO/RTO in the drill log (`docs/production/vps/11`).

Both scripts emit JSON event lines suitable for log aggregation.

## Verified locally

Backup + isolated restore + invariant checks were exercised end-to-end against
a real PostgreSQL 17 instance on 2026-10-02 (all ten migrations restored,
constraints intact, scratch dropped).

## NOT yet true (BLOCKED_EXTERNAL — do not claim otherwise)

- **PITR / RPO ≤ 15 min**: requires base backup + continuous WAL archive to
  an off-host, encrypted storage target. No target is provisioned yet;
  `pg_dump` alone cannot meet it.
- **RTO ≤ 4 h**: unproven until a drill runs against production-shaped data
  on the real host.
- **Off-host copies**: the retention window currently lives on one host; a
  local-only backup is not a backup against host loss.
