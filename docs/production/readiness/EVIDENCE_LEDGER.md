# Evidence ledger

Status words: PASS, FAIL, NOT_RUN, BLOCKED_EXTERNAL, DEFERRED_APPROVED. Times are UTC. No secret values, author emails, or customer data are recorded here.

## Source

| Item | Value | Status | Time |
|---|---|---|---|
| `origin/main` | `6a2f4516e77325cd786bde72e97eef48b9e786ed` (merge of [PR #9](https://github.com/yubiefood-id/yubie-platform/pull/9)) | PASS | 2026-10-20T04:20Z |
| CI run `39312784211` on `6a2f451` | quality, persistence, containers: success | PASS | 2026-10-20T04:20Z |
| Open PRs | none | PASS | 2026-10-20T04:20Z |
| [Issue #7](https://github.com/yubiefood-id/yubie-platform/issues/7) | open | NOT_RUN | 2026-10-20T04:20Z |
| Release-candidate workflow | last run `37772177252` for `aa00c53` (2026-10-08). No run for `6a2f451` | FAIL (no RC for HEAD) | 2026-10-20T04:21Z |

Untracked files in the operator checkout, by name and risk class only:

- `YUBIE_CODEX_PRODUCTION_EXECUTION_MASTER_PROMPT.md`, `YUBIE_PRODUCTION_FINALIZATION_PLAN.md`: planning input, not committed.
- `*:Zone.Identifier`: Windows download metadata, never committed.
- A file whose name refers to an API secret: treated as secret material. Not read, not committed.

## Images

| Item | Value | Status | Time |
|---|---|---|---|
| GHCR versions for api, worker, bot | `gh api` returned 403: token lacks `read:packages` | BLOCKED_EXTERNAL | 2026-10-20T04:24Z |
| Digest for `6a2f451` | none known; no RC run for this SHA | FAIL | 2026-10-20T04:24Z |
| Local build, `infrastructure/docker/Dockerfile.api` | `sha256:d49517ceaa769e14597396edd4778fe2f52da85da7400c9b6fe99b14e762f971` (local image id, not a registry digest) | PASS | 2026-10-20T04:55Z |
| Local build, `Dockerfile.worker` | `sha256:5762ea2d469c6deed7addcd7adfad9a42afc10722f359090679314801b969e17` | PASS | 2026-10-20T04:55Z |
| Local build, `Dockerfile.bot` | `sha256:c0662a73b35593d31b28193ff5eb73a11c3590c6d6188aa8609bb5dc2e021154` | PASS | 2026-10-20T04:55Z |

The first local image build failed inside `npm ci` with npm's "Exit handler never called" under the default WSL Docker bridge network. A rebuild with `--network=host` passed. CI builds the same Dockerfiles without that flag, so this is a local network issue, not a source issue.

## Staging runtime

| Item | Value | Status | Time |
|---|---|---|---|
| API `/healthz` | 200, `releaseSha=aa00c53fe543f385eff4237ceeb1a27fdc878fd4` | PASS (reachable). Deployed SHA is **not** `6a2f451` | 2026-10-20T04:25Z |
| API `/readyz` | 200, database connected, `commerceProvider=preview` | PASS | 2026-10-20T04:25Z |
| Web `staging.yubiefood.com` | 302 to Cloudflare Access | PASS (gated) | 2026-10-20T04:25Z |
| Worker `yubie-web-staging` active version | `4cfac3b5-2898-4e52-ba55-ddaabd67be72`, deployed 2026-10-19T16:53:48Z | PASS | 2026-10-20T04:26Z |
| Worker rollback target | `76ad2992-2bc6-49b5-9b5e-d4c8e1d5bc5c` | PASS | 2026-10-20T04:26Z |
| Worker secret names | `API_PROXY_TOKEN` only | PASS | 2026-10-20T04:26Z |
| Worker source SHA | not recorded in deployment metadata | NOT_RUN | 2026-10-20T04:26Z |
| VPS `docker ps` / `docker inspect` on `vps-contabo-yubie-1` | `ssh` with the configured deploy key: `Permission denied (publickey,password)`. No other key was tried | BLOCKED_EXTERNAL | 2026-10-20T04:27Z |
| Staging `schema_migrations` rows | needs VPS access | BLOCKED_EXTERNAL | 2026-10-20T04:27Z |
| Staging backup listing | needs VPS access | BLOCKED_EXTERNAL | 2026-10-20T04:27Z |

The API image `aa00c53` predates `0011_checkout_intent.sql`. Do not apply `0011` or later to staging until an RC image for the merged SHA exists and a verified backup is taken.

## Migrations per environment

| Environment | Applied | Status |
|---|---|---|
| Repository `6a2f451` | `0001` to `0011` | PASS |
| Local disposable Postgres 17 | `0001` to `0011` applied by `npm run db:migrate`, then `npm run db:seed` (260 assistant eval cases) | PASS, 2026-10-20T04:33Z |
| Staging | unknown | BLOCKED_EXTERNAL |
| Production | not provisioned for first-party checkout | NOT_RUN |

## Local test evidence on `6a2f451`

Postgres: `postgres:17-alpine` image `sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995`, tmpfs data, bound to `127.0.0.1`, removed after use.

| Command | Result | Time |
|---|---|---|
| `npm ci` | exit 0 | 2026-10-20T04:31Z |
| `npm run test --workspace @yubie/persistence` with `DATABASE_URL` | 13 pass, 0 fail, 0 skipped | 2026-10-20T04:34Z |
| api / assistant / worker / bot / integrations tests with `DATABASE_URL` | 29 / 25 / 11 / 5 / 38 pass, 0 fail, 0 skipped | 2026-10-20T04:35Z |
| `npm run check` | exit 0 | 2026-10-20T04:39Z |
| `npm run build` | exit 0, Sites artifact validated with a secret-free client bundle | 2026-10-20T04:40Z |

Nothing in this ledger is deployed. A green CI run is not a deployment.
