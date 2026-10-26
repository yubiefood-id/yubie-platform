# Controlled disabled-commerce release

This procedure replaces the argument-driven root deployment command from
PR #53. The old `a9b717e` source and published images remain a frozen historical
pair. Changes to the runner, Compose or application require a new reviewed SHA,
five passing main CI checks and protected replacement artifact publication.
Do not reuse the old image labels for modified code.

## Observed baseline — 2026-10-26 UTC

Read-only inspection from Ubuntu/WSL confirmed key-based `ssh yubie-vps`, strict
stored-host-key verification and remote account `yubie-deploy` on
`vmi3646941` (`84.247.158.36`). Noninteractive sudo and Docker access were denied.
The production Compose and its directory, and the previous backups directory,
were user-owned. The root-owned staged PR #53 script and Compose matched Git.

API health/readiness returned 200 with source
`379f978609f82305126ad7100c8dd6befd8022a8`, PostgreSQL connected and provider
`preview`. The active Worker remained
`e6c5a4dc-f3d9-4fdc-b710-97904e680cea`; both storefront hosts returned 200.
The new availability route returned 404. These are old-deployment observations,
not acceptance of the replacement release.

The operator reported production, admission disabled, inventory lots and support
disabled; the privileged preflight must independently verify them. A migration
container's inherited API HTTP probe is not evidence of migration failure.
Check its actual exit code and database versions. This release disables that
probe for the one-shot migration service only.

No sudo password belongs in chat, argv, scripts, environment, logs or automated
stdin. Operator authentication stays in the existing trusted interactive VPS
terminal. Keep the existing SSH key; do not exchange new keys for this release.

## Review and publication — local WSL and GitHub

1. Preserve local changes outside Git, then use an isolated persistent worktree.
   Review the full diff, including the root bootstrap, policy, runner, exact
   schema checks, Compose and CI workflow. Run `npm ci` and `npm run check`.
2. Required CI includes isolated root/sudoers negative tests and real synthetic
   PostgreSQL backup/restore/schema tests. The Docker fixture never receives
   the host Docker socket and never connects to production.
3. Merge through existing protected rules. Wait for all five checks on merged
   main and the existing protected staging publication approval. Image contexts
   come from `git archive` of that exact SHA, not mutable working files.
4. The candidate workflow scans the published images, builds a clean
   `DIRECT_COMMERCE_PRODUCTION` Worker, verifies its complete client/server byte
   identity and publishes `commerce-release-<sha>`.

The preflight binds the migration, API and worker connection URLs to the same
`postgres` service and the actual running container's database name. URLs with
another host/database, a nonstandard port or query overrides are rejected.
The running API/worker URL must also match the proposed configuration; a release
cannot silently change database credentials or switch its backup target.
Connection URLs are compared in memory and never included in evidence output.

Browser CI uses Ubuntu's official HTTPS archive instead of the Azure mirror
that timed out during Playwright dependency installation on 2026-10-26. This
covers both direct sources and hosted-runner `mirror+file` lists (the main
runner used `/etc/apt/apt-mirrors.txt`). A regression executes the actual CI step
against both formats and preserves suite/signing configuration. This changes
only ephemeral runner package transport; signed Ubuntu package checks,
the browser matrix and all five required gates remain unchanged.

The artifact contains `backend.tgz`, `web.tgz`, `install_release.py`,
`release-manifest.json`, `SHA256SUMS`, and `OWNER_SETUP.sh.txt`. Verify the GitHub
artifact digest and the checksums against the protected job summary. Backend
materials are taken directly from Git blobs. The manifest binds the exact source,
API/worker registry digests, helper/Compose/migration hashes, expected migration
filenames, and complete production Worker archive identity.

Never accept a merely published image as proof of deployment, and never approve
frontend writes using the staging image-publication approval alone.

## Protected bootstrap — operator's existing ROOT VPS session

From WSL, stage the verified files without overwriting an existing different
release directory:

```sh
scp -r <verified-artifact-directory> yubie-vps:/home/yubie-deploy/yubie-release-<sha>
```

After reviewing the literal SHA/checksums in `OWNER_SETUP.sh.txt`, copy its exact
commands into the already authenticated root terminal. Do not execute a script
directly from a user-writable directory. The commands first copy the bootstrap
and archive into a fresh private directory under `/root`, verify both against
the protected CI checksums, then execute the verified bootstrap.

Bootstrap installs immutable material under `/opt/yubie/releases/<sha>`, a
root-owned `/usr/local/sbin/yubie-release-<sha>` wrapper, and one sudoers rule.
It takes root control of only the Yubie production directory and preserves the
reviewed current Compose bytes using a new root-owned inode. It never rewrites
the protected production env, changes a PSP, starts containers or grants release
authorization. The old user-owned backups directory is not trusted or changed.

Private state and backups use `/var/lib/yubie-release` and
`/var/backups/yubie-commerce` (root, 0700). Sudoers permits only the fixed wrapper
with the explicit no-arguments restriction `""`, `NOPASSWD`, `NOSETENV`, minimal
environment and fixed executable paths. Bootstrap validates `visudo -c`.
Existing password-authenticated sudo membership is reported separately; this
does not make the account generally nonadministrative.

Provision a dedicated `read:packages` registry credential directly in protected
root storage at `/etc/yubie/registry/config.json`, root 0600 within root 0700.
Use the operator's trusted interactive registry login; never supply a token in
chat or automation arguments. Local WSL registry permission and root VPS registry
permission are independent. Preflight must prove registry reads with that store.

## Preflight and authorization — WSL, then operator ROOT

From WSL run the exact wrapper without additional arguments:

```sh
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes yubie-vps \
  'sudo -n /usr/local/sbin/yubie-release-<sha>'
```

Before authorization, this produces a sanitized preflight and blocks deployment.
It checks root-controlled ancestors/materials, effective Compose, current
container/image identities and migration exit status, flags, exact schema
baseline, financial exception aggregates, pending provider/inbox consistency,
disk capacity and registry reads. Private audit temporary files and a lock are
allowed; production data, services and active configuration are unchanged.

Expected posture is production, disabled admission, lots inventory, database
purchase options, disabled support and the existing PSP on API and worker.
Do not change a mismatched flag or PSP automatically. Unresolved payments from
another PSP, financial exceptions or a failed prior migration block rollout.
Only the reviewed pre-upgrade migration set or the complete target set is
accepted. An unexplained partially upgraded schema needs qualified review.

Check negative policy cases using harmless commands from WSL: extra wrapper
arguments, `sudo -n -E`, a shell no-op, `docker info` and an alternate Python
command must not gain unattended root execution. Never test destructive probes.
The isolated CI fixture verifies these cases and environment-injection handling.

Only after reviewing preflight and approving this exact disabled backend release,
the operator creates root-private `authorization.json` beside the generated
`authorization-template.json`. Supply actual approval owner/reference, a current
UTC window of at most one hour, the manifest digest, exact baseline API/worker
image IDs and existing PSP. Templates and missing authorization cannot deploy.
This is a separate explicit operator action, not implied by installing sudoers.

Rerun the same fixed wrapper from WSL after authorization. No password input,
extra arguments, arbitrary Compose path, `sudo bash`, `sudo docker`, Docker-group
workaround or broad passwordless rule is part of this procedure.

## Authorized backend execution and recovery

Bootstrap and the wrapper serialize all versions using one host lock. It records its commands
and durable stage history in root-private state. It validates published immutable
images and OCI revision labels before any schema/application change.

The backup uses an exported PostgreSQL MVCC snapshot shared by the custom dump
and aggregate verification metadata. A separately named scratch database must
restore successfully and match the **pre-upgrade** migration set and selected
counts. It is never production's restore target. Cleanup requires the scratch
name, original OID and release marker to match. If creation has an unknown outcome
before a marker/OID can be established, preserve the recorded name and request
manual identification; never drop a database based on its prefix alone.

After restore proof, authorization and env identity are checked again. Apply only
the reviewed migrations, then verify every expected filename through 0025 plus
independent columns, tables, indexes, recovery foreign key and enabled append-only
trigger. A migration-count threshold is insufficient.

Replace only worker, then API, with `--no-deps` in `yubie-prod`. Worker readiness
requires jobs started and completed after that replacement's `StartedAt`, the
correct image/source identity, schedules, notification backlog bounds and
reconciliation evidence appropriate to the preserved provider. Preview no-op
queue completions do not establish live provider reconciliation health.

API acceptance checks pinned runtime images/source labels, health/readiness,
frozen invalid-body checkout (explicitly non-chargeable), nine availability rows
and unauthenticated private-data rejection. Only after acceptance is the active
Compose atomically updated with literal image digests and source identity.
Production env contents remain unchanged.

A verified completed rerun performs read-only verification. Any partial mutation
or failed operation blocks automatic rerun. Inspect the journal, current images,
schema, financial events and backup before qualified forward repair or compatible
rollback. Do not erase the journal to force another deployment. Older workers
cannot drain migration 0024's notification inbox. Never restore an older backup
over legitimate orders; never change PSP during unresolved payment recovery.

## Separate frontend release and final evidence

After backend acceptance, obtain separate explicit protected approval for the
exact frontend source/archive digest. From WSL, extract the verified `web.tgz`
into a clean matching source checkout, validate its release manifest and use the
pinned Wrangler version/config. Preserve `yubie-web-production`, both custom
domains and `ASSETS`; do not change DNS or route the apex to Vercel.

Verify both domains, all referenced JS/CSS and lazy modules, desktop/mobile and
320px behavior, session/recovery endpoints, no-store headers, accessibility and
customer boundaries. Real Google and provider sandbox acceptance require their
own authorized sessions/evidence; synthetic tests cannot establish them.

Write a UTC receipt containing actual commands, approvals, source/image/Worker
identities, restore proof, exact migrations, runtime/worker/financial evidence,
rollback compatibility and independently truthful flags: CODE_READY,
ACCESS_READY, INVENTORY_VERIFIED, SANDBOX_ACCEPTED, MERCHANT_PRODUCTION_READY,
BACKEND_DEPLOYED, WEB_DEPLOYED, PRODUCTION_SMOKE_PASSED, LIVE_PAYMENT_ENABLED.
Unknown quantities remain unknown. This procedure never initializes stock,
approves shipping, activates merchant payments or establishes FULL_COMMERCE_GO.

PostgreSQL references: [consistent custom dumps and --snapshot](https://www.postgresql.org/docs/17/app-pgdump.html),
[snapshot synchronization](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION).
