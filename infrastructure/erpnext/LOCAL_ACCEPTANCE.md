# Local native ERP acceptance — 2026-10-21

Production is **NOT_PROVISIONED** and **NOT_ERP_OPERATOR_READY**. The user authorized isolated local installation and synthetic transactions. No shared VPS, public ingress, production migration, real-money operation or Commerce stock write was performed.

The existing images.lock.json pins ERPNext v16.51.1 and official frappe_docker commit df2a3b72910634cf0e878b59eccf68a93736bf9d, with MariaDB11.8 and Redis8.6 image digests. The [official release](https://github.com/frappe/erpnext/releases/tag/v16.51.1) was published 2026-10-15; [official support policy](https://github.com/frappe/erpnext/wiki/Supported-Versions) lists v16 supported through planned end2029. The actual image reports Frappe16.52.0/ERPNext16.51.1. This pin does not itself establish production vulnerability acceptance.

## Reproduction and secrets

Use the local Docker Unix socket and a NEW project yubie-erp-native-YYYYMMDD. Retrieve only the pinned upstream compose.yaml and MariaDB/Redis overrides, then layer compose.acceptance.yml last. Validate config --quiet, never expanded configuration. No shared external networks or existing volumes. Only 127.0.0.1:8088 is published; MariaDB/Redis remain private.

Keep private configuration in ~/.local/state/yubie/erp-native/YYYYMMDD (0700), local.env and users.json (0600). This survives a host restart; temporary /tmp worktrees do not. local.env contains a random ERP_DB_ROOT_PASSWORD, ERPNEXT_VERSION=v16.51.1, DB_HOST=db, DB_PORT=3306, REDIS_CACHE=redis-cache:6379, REDIS_QUEUE=redis-queue:6379, FRAPPE_SITE_NAME_HEADER=erp.yubie.test, PULL_POLICY=missing and RESTART_POLICY=no. Secrets are never committed, printed, placed in chat or pasted into shell history.

Use the pinned bench new-site command to create erp.yubie.test with --install-app erpnext --set-default; enter database-root and administrator passwords privately. The execution used a private stdin-driven process, not weak defaults. Copy the three Python native fixture/workflow/acceptance files into /tmp inside the backend container, using these names:

```text
docker cp infrastructure/erpnext/native_fixtures.py PROJECT-backend-1:/tmp/yubie_native_fixtures.py
docker cp infrastructure/erpnext/native_workflows.py PROJECT-backend-1:/tmp/yubie_native_workflows.py
docker cp infrastructure/erpnext/native_acceptance.py PROJECT-backend-1:/tmp/yubie_native_acceptance.py
docker exec PROJECT-backend-1 bench --site erp.yubie.test execute "exec(open('/tmp/yubie_native_fixtures.py').read(), {})"
docker exec PROJECT-backend-1 bench --site erp.yubie.test execute "exec(open('/tmp/yubie_native_workflows.py').read(), {})"
docker exec PROJECT-backend-1 bench --site erp.yubie.test execute "exec(open('/tmp/yubie_native_acceptance.py').read(), {})"
```

Fixtures refuse other sites. Six separate synthetic role users lack System Manager. A seventh read-only integration identity has native Item/Warehouse/Bin/Batch read permissions and Released warehouse restriction; native Stock Entry creation is denied. Frappe's add_permission helper preserves standard operator grants when custom permissions are introduced. The regression asserts both preservation and denial.

Credentials are random and stored only in the site's private/yubie-synthetic-users.json (0600). Welcome email is disabled. Copy that file privately to users.json in the protected local store. On this synthetic site only, complete local setup (System Settings setup_complete) before browser login. Build the existing packages with npm run build, then run:

```text
ERP_LOCAL_CREDENTIALS_FILE=~/.local/state/yubie/erp-native/YYYYMMDD/users.json node infrastructure/erpnext/operator-browser.mjs
ERP_LOCAL_CREDENTIALS_FILE=~/.local/state/yubie/erp-native/YYYYMMDD/users.json node infrastructure/erpnext/native-shadow.mjs
python3 infrastructure/erpnext/restore_local.py ~/.local/state/yubie/erp-native/YYYYMMDD/local.env
```

Use an expanded absolute credential path in environments that do not expand tilde assignments. The browser harness opens only loopback8088, verifies six fresh native sessions, and exports no traces, screenshots or cookies. Original Playwright errors are suppressed because fill call logs can include credentials.

native-shadow additionally requires the dedicated migrated PostgreSQL17 fixture on loopback55432 (database yubie_test, synthetic yubie/yubie_local), and a short-lived local TLS certificate cert.pem/key.pem with SAN IP127.0.0.1 in the private store (key0600). The local HTTPS proxy trusts only that certificate and forwards GET resource reads to loopback Frappe; TLS verification is never disabled. Existing ErpNextShadowClient/StockReader and real PostgresOutboxRepository are reused. The only PostgreSQL mutation is a synthetic discrepancy event.

restore_local.py validates the local Docker endpoint/project label and private file modes. It backs up SQL, public/files and private/files; creates a NEW random erp.restore-XXXXXXXX.yubie.test site; refuses overwrite; restores a distinct database/files and application encryption key while preserving the new database login; and runs native assertions. Public/private marker files and encrypted API-secret decryption are verified. The expected synthetic secret remains in the independent local fixture secret store: Frappe's standard file backup does not back up arbitrary files placed directly under private/. Off-host encrypted backup/restore is a separate production gate.

## Evidence and acceptance limits

Native assertions and real Playwright logins passed for the local deployment. Native document assertions cover all nine SKU Items, four warehouses, batch receipt/transfer, purchase order/receipt/invoice, BOM/work order/manufacturing stock entry, accepted inspection, release transfer, delivery, sales invoice and synthetic payment entries. Both invoices have zero outstanding balance; five raw units remain quarantined. Native REST plus real PostgreSQL proves released reads, quarantine exclusion, API write denial and durable discrepancy recording. A full local restore clone passed the same assertions, including file markers and encryption-key compatibility. These are actual native/local tests, not mocked Frappe responses.

Transactions run under local Administrator to exercise ERP behavior. Setting inspected_by=qa@yubie.test does not establish that a QA operator executed the workflow. All nine Items use Nos as synthetic package-count UOM. The artificial BOM consumes one fixture unit to produce another; it is not a Yubie formulation or mass conversion. +30-day test batch expiry is not an approved shelf-life statement. Synthetic rates, chart of accounts and tax defaults are not Finance approval.

Still required before ERP_OPERATOR_READY: approved isolated production hosting/TLS/Access/MFA; named real operators and role-specific UAT; approved product specifications/UOM/BOMs and Finance setup; enforced QA/quarantine/recall segregation; native batch-aware FEFO and atomic reservation across channels; production durable synchronization/reconciliation; encrypted off-host restore, monitoring/alert delivery and production hardening. The existing Bin shadow reader is not an approved batch/expiry or reservation authority. Commerce ERP stock writes remain denied until these gates pass.

The host restarted during validation. Existing local containers/volumes and data were recovered, source moved to a persistent worktree, and native checks rerun. RESTART_POLICY=no is a local-test choice, not production reliability acceptance. Stop only this local project after evidence capture; preserve backups. Never use down -v against an operational environment.
