# Staging baseline evidence

Collected **2026-10-19T17:51:06Z** on branch `feat/staging-e2e-ipaymu-sandbox` from source HEAD `7167636e6f2994115e2b84bac779359d7d4170c3`. No secret values are recorded. Status words: PASS, FAIL, BLOCKED_EXTERNAL, NOT_RUN.

## Git and CI

| Check | Result | Evidence |
|---|---|---|
| HEAD | PASS | `7167636e6f2994115e2b84bac779359d7d4170c3` Merge PR #8 |
| Open PRs | PASS | `gh pr list --state open` returned no open pull requests |
| Issue #7 | PASS | OPEN: `[P0] Integrate iPaymu Redirect sandbox with safe order reconciliation` — https://github.com/yubiefood-id/yubie-platform/issues/7 |
| CI on HEAD | PASS | Run 39240455990 success: quality, persistence, containers. https://github.com/yubiefood-id/yubie-platform/actions/runs/39240455990 |
| Release-candidate image for HEAD | FAIL | Last successful release-candidate dispatch is run 37772177252 at `aa00c53fe543f385eff4237ceeb1a27fdc878fd4` (2026-10-08). HEAD has no published release-candidate run. |

Local dirty tree preserved (not reverted):

- `apps/web/app/api/purchase-options/[slug]/route.ts` proxies through `proxyApi` instead of an unauthenticated origin fetch.
- `apps/web/wrangler.jsonc` sets `workers_dev: false` and `preview_urls: false`.
- Untracked `YUBIE_STAGING_E2E_CODEX_MASTER_PROMPT.md` is the execution spec.
- Untracked `tikan API secret masih terdaftar` is excluded from git. A pattern scan found no UUID, long digit run, API-key assignment, Google client host, or bearer token. The file is escape-laden and the filename claims a secret is still registered, so it stays untracked.

## Deployed runtime versus source

| Check | Result | Expected | Actual |
|---|---|---|---|
| Staging API health | PASS | JSON ok | `GET https://api-staging.yubiefood.com/healthz` HTTP 200 via Caddy. `service=yubie-api`, `releaseSha=aa00c53fe543f385eff4237ceeb1a27fdc878fd4` |
| Staging API readiness | PASS | database connected, preview commerce | `GET /readyz` HTTP 200. `database=connected`, `commerceProvider=preview` |
| API SHA equals source HEAD | FAIL | `7167636…` | Running SHA is `aa00c53…`. Commits after that SHA are docs, `staging.env.example`, `apps/web/config/site.ts`, and `apps/web/wrangler.jsonc`. No migration files differ. Payment application code in the image matches that older SHA, not the uncommitted web patch. |
| Unauthenticated purchase options | PASS | 401 without proxy token | `GET /v1/products/yubie-shake/purchase-options` HTTP 401 |
| Staging web Access | PASS | unauthenticated request does not render the storefront | `GET https://staging.yubiefood.com/` HTTP 302 to the Cloudflare Access login host for that hostname |
| Access allow-list membership | BLOCKED_EXTERNAL | named emails only, no Everyone, no Bypass | Zone Access apps API returned HTTP 403 with the current Wrangler OAuth scopes. Account Access apps list was empty. Policy contents were not read. |
| Worker secret names | PASS | `API_PROXY_TOKEN` present, values unread | `wrangler secret list --name yubie-web-staging` returned only `API_PROXY_TOKEN` (`secret_text`). Bindings also include non-secret `YUBIE_API_ORIGIN`. |
| Worker version | PASS | a version is deployed | Active version `4cfac3b5-2898-4e52-ba55-ddaabd67be72` created 2026-10-19T16:53:46Z. Previous upload `76ad2992-2bc6-49b5-9b5e-d4c8e1d5bc5c` at 2026-10-19T16:20:57Z. |
| workers.dev and preview URLs | PASS | disabled | Script subdomain settings: `enabled=false`, `previews_enabled=false`. Probing the script workers.dev host returned HTTP 404. A guessed preview host also returned HTTP 404. |
| Google OAuth client type | NOT_RUN | Web application client, not an API key | Worker secrets do not contain `GOOGLE_CLIENT_ID` (it belongs on the API). This audit did not open Access or call `/v1/auth/session`, so it did not observe SET/MISSING or the client type. An operator statement in chat is not independent proof. |
| Local Postgres | NOT_RUN | staging data only | `pg_isready` on this workstation had no server. Staging readiness already reported `database=connected`. |
| Backup restore drill | NOT_RUN | isolated restore | Procedure text exists in `docs/development/execution/M5_D_RC_LIVE_STAGING_PLAYBOOK.md` Phase 16 and `docs/production/14_GO_LIVE_CHECKLIST.md`. This session did not run `pg_dump` or a restore. Prior report `M5_D_RC_STAGING_REPORT.md` still marks live restore BLOCKED_EXTERNAL. |

## Source migrations present

`packages/persistence/migrations/0001_initial.sql` through `0010_growth_and_consent.sql`. None of those files changed between the running image SHA and HEAD.

## Commands that were not run

- No iPaymu HTTP call. Chat-supplied VA and API key were not stored or sent.
- No Cloudflare Access policy mutation, no Worker deploy, no Caddy edit, no database reset.
