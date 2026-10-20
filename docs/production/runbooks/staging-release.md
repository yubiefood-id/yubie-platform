# Staging Release, Migration, and Rollback

Moves staging from the running image to a reviewed `main` SHA and applies
pending migrations. It keeps `COMMERCE_PROVIDER=preview`. It does not
authorize production, provider activation, DNS or Access changes, or data
deletion.

Last known staging state: API `releaseSha=aa00c53`, schema through `0010`,
commerce `preview`. Pending on that database: `0011_checkout_intent`,
`0012_guest_intent`, `0013_payment_observability`.

## 0. Roles and evidence

One operator runs the steps; a second person reviews the evidence before
step 5. Record for every step: UTC time, command, exit code, and output
excerpt. Never paste `/etc/yubie/staging.env` values, dump contents, or
tokens.

## 1. Choose and verify the release SHA

```bash
SHA=$(git rev-parse origin/main)          # full 40-char SHA, reviewed
gh run list --branch main --commit "$SHA" --workflow CI --json conclusion
```

All five CI jobs (`quality`, `persistence`, `security`, `browser`,
`containers`) must be `success` on `$SHA`.

## 2. Publish the release candidate (owner approval required)

```bash
gh workflow run release-candidate.yml --ref main -f sha="$SHA"
gh run watch "$(gh run list --workflow release-candidate.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

The workflow refuses any SHA that is not current `main` or not fully green,
blocks HIGH/CRITICAL image vulnerabilities, and writes the three image
digests and SBOMs to the job summary. Copy the digests into the evidence log.

## 3. Back up and prove the backup (staging host)

```bash
sudo -u yubie env DATABASE_URL="$STAGING_DATABASE_URL" YUBIE_BACKUP_DIR=/var/backups/yubie \
  bash infrastructure/backup/yubie-db-backup.sh
sudo -u yubie env DATABASE_URL="$STAGING_DATABASE_URL" YUBIE_BACKUP_DIR=/var/backups/yubie \
  bash infrastructure/backup/yubie-db-restore-test.sh
```

Use PostgreSQL 17 client tools (the server major version); an older
`pg_dump` aborts. The backup writes atomically and fails without leaving a
partial file; the drill refuses a dump whose checksum is missing or wrong.
Expect `backup.completed` then `restore_test.passed`. Note: the drill runs
from the *currently checked out* repo, so run it from the old SHA here (it
checks that every shipped migration is applied) and again after step 5 from
the new SHA. Copy the dump off the host before continuing.

Stop here if either command fails.

## 4. Drain writes

Staging commerce is `preview`, so no provider sessions are open. Stop the
worker so no reconcile job runs during migration:

```bash
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml stop worker
```

## 5. Migrate and deploy

```bash
sudoedit /etc/yubie/staging.env        # RELEASE_SHA=$SHA ; confirm COMMERCE_PROVIDER=preview
set -a; . /etc/yubie/staging.env; set +a; npm run config:validate
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml pull
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml run --rm migrate
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml up -d --remove-orphans
```

Expected migrate output: `Applied 0011_checkout_intent.sql`,
`Applied 0012_guest_intent.sql`, `Applied 0013_payment_observability.sql`,
`Migrations complete`. Each migration runs in its own transaction; a failure
rolls that migration back and stops the run.

Lock notes: `0011` adds two nullable columns (metadata only) and one partial
index. `0012` updates existing `order_payments` principal keys and adds a
CHECK constraint (full-table validation). `0013` builds five indexes with
standard `CREATE INDEX`, which blocks writes to `order_payments`,
`webhook_inbox`, and `inventory_reservations` while it runs. On staging
volumes this is seconds; time it and record the duration as the production
estimate.

## 6. Verify

```bash
curl -fsS https://api-staging.yubiefood.com/healthz     # releaseSha == $SHA
curl -fsS https://api-staging.yubiefood.com/readyz      # 200
curl -fsS -H "authorization: Bearer $OPS_API_TOKEN" \
  https://api-staging.yubiefood.com/ops/payments/exceptions?limit=5   # 200, items listed or []
```

Through the storefront: Google Login, product page, add to cart, checkout
shows preview (no provider redirect). Confirm a response carries an
`x-request-id` header and the worker logs `worker.payment_reconcile` or stays
idle (preview has no provider, so the reconcile handler no-ops).

## 7. Rollback

Application rollback is schema-compatible: `0011`–`0013` only add nullable
columns, indexes, a principal-format CHECK that allows NULL, and a one-time
principal rewrite. The previous image (`aa00c53`, schema through `0010`)
never writes the new columns.

```bash
sudoedit /etc/yubie/staging.env        # RELEASE_SHA=<previous full SHA>
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml pull
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml up -d --remove-orphans
```

Do not run `migrate` on rollback, and do not drop the new columns or indexes.
Database rollback is a restore of the step 3 dump into a new database and a
`DATABASE_URL` switch, decided by the owner, never a volume delete.

## 8. Close

Restart the worker if it was stopped and not recreated by `up -d`, record
the release SHA, digests, migration durations, and verification evidence in
`docs/production/readiness/MILESTONE_GATES.md` (M3).
