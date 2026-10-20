# Post-PR11 blocker register

Evidence refreshed **2026-10-20T14:20:00Z** at `origin/main=77a36c157039401bc7ce543afe0365a4b4006b9b`.
Production decision: **NO-GO**. Staging still reports `releaseSha=aa00c53fe543f385eff4237ceeb1a27fdc878fd4`,
database connected, `commerceProvider=preview`. No release candidate was published, no workflow was
dispatched, no migration was applied remotely, and no credential was rotated.

Class: `CODEX_NOW` (engineering can finish without external input), `USER_INTERVENTION` (owner or
operator action), `PROVIDER_DEPENDENCY` (iPaymu or another vendor), `SHARED` (engineering done; needs an
owner action to close).

## Merged engineering (2026-10-20)

| PR | Content | Merge |
| --- | --- | --- |
| [#13](https://github.com/yubiefood-id/yubie-platform/pull/13) | Callback, identity, concurrency and recovery tests on PostgreSQL | `9102983` |
| [#14](https://github.com/yubiefood-id/yubie-platform/pull/14) | Pinned Actions, Gitleaks, Semgrep, Trivy fs/image, SBOM, Playwright desktop/mobile | `1345d53` |
| [#15](https://github.com/yubiefood-id/yubie-platform/pull/15) | Request correlation, payment metrics, `/ops/payments/exceptions`, migration `0013`, runbook | `b66af20` |
| [#12](https://github.com/yubiefood-id/yubie-platform/pull/12) | Sandbox probe (protected env, reviewed SHA), admin reader seam, ERP discrepancy math | `5957947` |
| [#16](https://github.com/yubiefood-id/yubie-platform/pull/16) | Read-only PostgreSQL admin readers | `9d163ef` |
| [#17](https://github.com/yubiefood-id/yubie-platform/pull/17) | ERP shadow reconcile: mappings, retry, dead letter; writes disabled | `579913b` |
| [#18](https://github.com/yubiefood-id/yubie-platform/pull/18) | Staging release runbook; atomic backup; checksum-verified restore drill | `77a36c1` |

## Register

| ID | Claim | Current evidence | Class | Next action | Status |
| --- | --- | --- | --- | --- | --- |
| B01 | PR #11 payment P0 is on main | Merged `84b6603`; still the payment baseline | — | None | PASS |
| B02 | PR #12 reused, not duplicated | Hardened and merged at `5957947` | — | None | PASS |
| B03 | Staging runs merged code | `/healthz` reports `aa00c53` | USER_INTERVENTION | Approve RC dispatch for `77a36c1`, then follow `docs/production/runbooks/staging-release.md` | FAIL |
| B04 | Staging stays non-paying | `/readyz` `commerceProvider=preview` | SHARED | Keep until M2 passes and a switch is approved | PASS |
| B05 | Migrations `0011`–`0013` on staging | Not applied; runbook gives order, lock notes and rollback | USER_INTERVENTION | Backup + restore drill, then migrate per runbook step 5 | NOT_RUN |
| B06 | Agent can inspect VPS runtime | SSH `Permission denied (publickey,password)` | USER_INTERVENTION | Add a limited deploy key, or the operator runs the runbook and shares redacted output | BLOCKED_EXTERNAL |
| B07 | GHCR digests readable by agent | REST 403, token lacks `read:packages` | USER_INTERVENTION | Grant read-only package scope, or copy digests from the RC job summary | BLOCKED_EXTERNAL |
| B08 | RC exists for current main | Last RC is `aa00c53` (2026-10-08) | USER_INTERVENTION | `gh workflow run release-candidate.yml --ref main -f sha=77a36c157039401bc7ce543afe0365a4b4006b9b` | NOT_RUN |
| B09 | PostgreSQL payment invariants | CI `persistence` job green on every merged PR; local 23 pass / 0 skip | — | Keep in CI | PASS |
| B10 | Sandbox credentials available to the probe | Project's existing sandbox pair must sit in the protected `sandbox` environment; presence unverified | USER_INTERVENTION | Create `sandbox` environment with required reviewers; store `IPAYMU_SANDBOX_VA` and `IPAYMU_SANDBOX_API_KEY`; report SET/MISSING only | BLOCKED_EXTERNAL |
| B11 | Provider recovery semantics | Six questions in `IPAYMU_PROVIDER_CONTRACT.md` unanswered | PROVIDER_DEPENDENCY | Written iPaymu answers: cancel, lookup, duplicate reference, timeout trx id, timestamp MAC, JSON/form | BLOCKED_EXTERNAL |
| B12 | Real sandbox E2E | Harness hardened (main only, exact SHA, protected env, `CREATE_SESSION_PASS` scope); 10-step runbook `ipaymu-sandbox-e2e.md` | SHARED | After B03, B05, B10, B11 and an isolated sandbox instance: dispatch and record all 10 steps | NOT_RUN |
| B13 | Callback normalization and recovery | Local and CI green; missing payment record now retries instead of dropping | — | Keep in CI | PASS |
| B14 | Security and supply-chain CI | `security`, `browser`, `containers` jobs green on main | — | Optional: enable repository Dependency graph to restore GitHub dependency review (Trivy lockfile scan already blocks HIGH/CRITICAL) | PASS |
| B15 | Payment observability | Correlation ids, metrics, exceptions endpoint, runbook merged | SHARED | Wire metrics to alerting once monitoring is provisioned (M7) | PASS (code) |
| B16 | Private admin | Read-only BFF + PostgreSQL readers merged; Refine UI not installed; no staff OIDC, audit or deployment | USER_INTERVENTION | Provide staff OIDC client and allowlist, approve `ops-staging` DNS and Access policy | BLOCKED_EXTERNAL |
| B17 | ERPNext shadow pilot | Mappings, GET-only reader, retry/dead letter merged; writes refused; not scheduled | USER_INTERVENTION | Approve isolated ERPNext host, item mapping and read-only API user | BLOCKED_EXTERNAL |
| B18 | Access and Google console config | Not visible to agent; past login PASS is historical | USER_INTERVENTION | Confirm named-email Access policy and Google Web client origins | BLOCKED_EXTERNAL |
| B19 | Shipping, legal, product claims | No owner-signed evidence | USER_INTERVENTION | Approve shipping, privacy/terms/refunds, SKU claims | BLOCKED_EXTERNAL |
| B20 | Production merchant and operations | No production PSP contract, payout/refund drill, on-call | SHARED | Complete M2–M7 before a separate production-provider PR | BLOCKED_EXTERNAL |
| B21 | Off-host backup and PITR | Local `pg_dump` only; no encrypted off-host target | USER_INTERVENTION | Provision storage target for WAL archive and off-host dumps | BLOCKED_EXTERNAL |

No `CODEX_NOW` item remains. Every open item needs an owner, operator, or provider action.

## Acceptance matrix

| Area | UNIT_PASS | DB_PASS | CI_PASS | STAGING_PASS | PSP_SANDBOX_PASS | SECURITY_PASS | OWNER_APPROVED | PROD_GO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Checkout and payment correctness | PASS | PASS | PASS | BLOCKED_EXTERNAL | NOT_RUN | PASS | NOT_RUN | FAIL |
| Callbacks and reconciliation | PASS | PASS | PASS | BLOCKED_EXTERNAL | NOT_RUN | PASS | NOT_RUN | FAIL |
| Migrations `0011`–`0013` | PASS | PASS | PASS | NOT_RUN | — | — | NOT_RUN | FAIL |
| Observability | PASS | PASS | PASS | NOT_RUN | — | PASS | NOT_RUN | FAIL |
| Supply chain / CI gates | — | — | PASS | — | — | PASS | NOT_RUN | FAIL |
| Backup / restore | — | PASS (local drill) | — | NOT_RUN | — | — | NOT_RUN | FAIL |
| Admin (read-only) | PASS | PASS | PASS | BLOCKED_EXTERNAL | — | PASS | NOT_RUN | FAIL |
| ERP shadow | PASS | — | PASS | BLOCKED_EXTERNAL | — | PASS | NOT_RUN | FAIL |
| Google Login, storefront, cart | PASS | — | PASS | PASS (historical user test) | — | — | NOT_RUN | FAIL |

## Credential policy

Existing project-managed secrets are used as they are and are not rotated by engineering work. Values
exposed in chat or local untracked files are never read, copied, logged, committed, or used. Secret
state is reported only as `SET`, `MISSING`, or `UNVERIFIED`.

## Evidence commands

```bash
git rev-parse origin/main
gh run list --branch main --limit 1 --json headSha,conclusion
gh run list --workflow release-candidate.yml --limit 1 --json headSha,createdAt,conclusion
curl -fsS https://api-staging.yubiefood.com/healthz
curl -fsS https://api-staging.yubiefood.com/readyz
DATABASE_URL=postgres://yubie:yubie_local@127.0.0.1:55432/yubie_test npm test --workspace @yubie/persistence
```
