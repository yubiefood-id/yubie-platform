# 04 — PostgreSQL, Backup and PITR

## 1. Database roles

Target:

~~~text
yubie_app       normal CRUD
yubie_migrate   migrations
yubie_readonly  diagnostics/BI
backup role     minimum backup privileges
~~~

The app is never PostgreSQL superuser.

## 2. Network

No public port 5432. Remote diagnostics use VPN/SSH tunnel and named account.

## 3. Connection management

Use a bounded Node pool and monitor:

- connections;
- slow queries;
- locks;
- transaction duration;
- DB memory;
- WAL/disk.

Do not add PgBouncer until there is a measured need.

## 4. Backup layers

### PITR layer

Reliable point-in-time recovery needs:

~~~text
base backup + continuous WAL archive
~~~

A logical `pg_dump` alone is not PITR.

Choose a proven tool such as pgBackRest/WAL-G or a managed PostgreSQL equivalent and validate it.

### Logical export

Regular encrypted `pg_dump` for portability/forensics.

### Infrastructure snapshot

VPS snapshot is extra protection only.

## 5. Off-host storage

Backups must leave the VPS and use separate restricted credentials.

Use encrypted S3-compatible storage or independent host plus retention/lifecycle.

## 6. Planning targets

Once durable automation is live:

~~~text
RPO <= 15 minutes
RTO <= 4 hours
~~~

These are planning objectives requiring business approval and restore evidence.

## 7. Restore

~~~text
declare/freeze
 -> preserve failed volume
 -> select recovery point
 -> isolated restore
 -> verify schema/invariants
 -> reconcile provider events/import windows
 -> application smoke
 -> approve cutover
 -> monitor
~~~

## 8. Invariants

Verify:

- listing mappings;
- product fact/publication state;
- B2B lead uniqueness;
- inbox/outbox dedupe;
- operator tasks;
- marketplace import checksums;
- assistant policy refs.

## 9. Backup monitoring

Alert when base backup/WAL archive/object storage/retention/restore-drill freshness is unhealthy.

## 10. Drill

At least quarterly after production launch. Record actual RPO/RTO.
