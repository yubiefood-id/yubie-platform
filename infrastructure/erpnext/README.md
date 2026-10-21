# Isolated ERPNext acceptance contract

PREPARED, NOT DEPLOYED. No host/resource/cost approval or credentials are present. Do not run on the shared RetroPick/Yubie VPS. No running container, completed workflow, security approval or accounting sign-off is implied.

Reuse the official MIT-licensed [frappe_docker](https://github.com/frappe/frappe_docker/tree/df2a3b72910634cf0e878b59eccf68a93736bf9d). The reviewed pattern uses backend, frontend, websocket, two workers, scheduler and configurator, with separate MariaDB and Redis. Image index digests were resolved read-only from Docker Hub; `images.lock.json` pins them. Upstream source is not vendored or modified. ERPNext and database component licenses require operator review for the intended use.

After approval, an operator checks out that exact upstream commit on an isolated host, creates a private 0600 environment file with a fresh root password and approved site name, and uses this file order:

```text
compose.yaml
+ overrides/compose.mariadb.yaml
+ overrides/compose.redis.yaml
+ /reviewed/yubie-platform/infrastructure/erpnext/compose.acceptance.yml
```

Run `docker compose --env-file <private-file> -f ... config --quiet` before `up`. Do not print expanded configuration because it contains secrets. No automatic site creation, schema migration, public ingress, stock write or weak default administrator is supplied. Provision the site using the pinned upstream instructions with a named administrator and operator-managed credentials. Budget measured CPU/RAM/disk/backup capacity before starting; capture actual resource observations before acceptance. Frontend binds loopback 8088 only. Put named-staff Access/TLS in front of it after host approval. Keep MariaDB/Redis private. Back up sites and MariaDB to encrypted off-host storage and restore on a separate host before acceptance.

Create named Operations/QA/Manufacturing/Finance users and a separate GET-only integration identity scoped to approved Items, Warehouses and Bin reads. Approve chart of accounts, tax, currency, units, BOM and supplier fixtures before imports. Do not seed real customer data, product safety claims or unapproved shelf lives.

The full operational acceptance matrix is in `docs/production/readiness/ADMIN_ERP_SUPPORT_ACCEPTANCE.md`. Yubie's existing shadow reader stays GET-only. Physical ERP stock authority and Yubie reservations require an approved reconciliation design; no ERP stock write is enabled. On failure stop the isolated services without deleting volumes, preserve discrepancy/audit records and restore only into a separate test environment. Never run `down -v` against an existing operational environment.
