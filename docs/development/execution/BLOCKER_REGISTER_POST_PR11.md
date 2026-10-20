# Post-PR11 blocker register

Evidence captured **2026-10-20T06:40:00Z**. Production decision: **NO-GO**.
First-party staging payments remain `COMMERCE_PROVIDER=preview`. No workflow was
dispatched, no image was published, and no remote state was changed.

| ID | Claim | Current evidence | Owner | Severity | Next action | Dependency | Gate | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | PR #11 payment P0 is on main | `origin/main=84b66033cc53ee3a3180a0658f5923cb0ba83f5b`; main CI run `39374400844` succeeded | CODEX | P0 | Keep as payment baseline | None | M1 | PASS |
| B02 | PR #12 can be reused | PR #12 head `2ee54657b50cc1365417c05b8b21d6d8178917dd`, merge state CLEAN; quality, persistence, containers and Vercel checks succeeded | SHARED | P1 | Review protected-environment and reviewed-SHA gates before owner merge | Owner review | M2/M4/M5 | PASS |
| B03 | Staging runs the merged payment code | `GET https://api-staging.yubiefood.com/healthz` reports `aa00c53fe543f385eff4237ceeb1a27fdc878fd4`, not main | USER/OPERATOR | P0 | Publish and deploy a reviewed RC only after backup/restore approval | RC digest, backup | M3 | FAIL |
| B04 | Staging remains non-paying | `GET /readyz` reports database connected and `commerceProvider=preview` | SHARED | P0 | Preserve until sandbox acceptance and explicit switch approval | Provider and release gates | M2/M3 | PASS |
| B05 | Migrations 0011 and 0012 are on staging | Agent cannot read the migration ledger; last verified report says not applied | USER/OPERATOR | P0 | Run SELECT-only ledger check, then backup/restore before approved apply | Read-only host access | M3 | NOT_RUN |
| B06 | Agent can inspect VPS runtime | `ssh -o BatchMode=yes vps-contabo-yubie-1 ...` returned `Permission denied (publickey,password)` | USER/OPERATOR | P1 | Add this agent public key to the limited `yubie-deploy` account or provide redacted outputs | Host administrator | M3 | BLOCKED_EXTERNAL |
| B07 | GHCR versions/digests are readable | GitHub REST returned HTTP 403: token needs `read:packages` | USER/OPERATOR | P1 | Grant the current GitHub identity read-only package scope or provide digest output | GitHub organization owner | M3 | BLOCKED_EXTERNAL |
| B08 | An RC exists for main `84b6603` | Last release-candidate run is `37772177252` for older source; no digest for `84b6603` | USER/OPERATOR | P0 | After CI hardening, approve manual RC dispatch for exact reviewed SHA | Workflow dispatch approval | M3 | NOT_RUN |
| B09 | PostgreSQL payment invariants are complete | Local PostgreSQL 17 targeted proof: 13 pass, 0 fail, 0 skipped; full persistence suite: 24 pass, 0 fail, 0 skipped. Covers guest and authenticated 2/10/100, last-unit, promo totals, callback binding and callback transaction rollback | CODEX | P0 | Preserve in CI and repeat before merge | Local Docker | M1/M2 | PASS |
| B10 | iPaymu sandbox credentials are suitable | Credential presence and rotation cannot be inferred; exposed values will not be read or used | USER/OPERATOR | P0 | Attest that a sandbox pair is securely stored, reporting SET/MISSING only | Sandbox merchant owner | M2 | BLOCKED_EXTERNAL |
| B11 | Provider recovery semantics are known | Six questions in `IPAYMU_PROVIDER_CONTRACT.md` remain unanswered | PROVIDER | P0 | Obtain written answers for cancel, lookup, duplicate reference, timeout transaction ID, timestamp MAC and JSON/form normalization | iPaymu support | M2 | BLOCKED_EXTERNAL |
| B12 | Real sandbox E2E passed | PR #12 contains a create-only probe; it is not payment acceptance and has not been dispatched | SHARED | P0 | Harden protected manual harness; run only after explicit approval and prerequisites | B10, B11, deployed callback | M2 | NOT_RUN |
| B13 | Callback normalization and crash recovery are fully proven | Local callback/recovery selection: 30 pass, 0 fail. JSON/form normalization, poison input before poll, inbox rollback/redelivery, refund and replay are covered without external traffic | CODEX | P0 | Preserve in CI and repeat before merge | None | M1/M2 | PASS |
| B14 | Security and supply-chain CI is complete | Custom secret/payment scans exist; Gitleaks, actual Semgrep, Trivy, SBOM, dependency review and browser E2E are absent | CODEX | P1 | Add pinned least-privilege CI gates and local preview browser tests | GitHub Actions network for CI | M3 | CODEX_NOW |
| B15 | Payment observability is release-ready | JSON logging and worker metrics exist, but correlation and payment exception metrics/alerts are incomplete | CODEX | P1 | Add redacted correlation, metrics and runbooks | None | M3 | CODEX_NOW |
| B16 | Private admin is production-ready | PR #12 adds reader injection only; no Postgres readers, Refine UI, staff SSO, audit or deployment | SHARED | P1 | Finish local read-only app; keep OIDC, DNS and deploy operator-gated | PR #12, identity owner | M4 | CODEX_NOW |
| B17 | ERPNext shadow pilot is production-ready | PR #12 adds pure discrepancy math; no mappings, outbox, retry/DLQ or isolated host | SHARED | P1 | Finish local mock/read-only integration; keep writes refused | Isolated host approval for live pilot | M5 | CODEX_NOW |
| B18 | Access and Google console configuration are verified | Storefront returns HTTP 302 behind Access; account policy and OAuth console settings are not visible to this agent. Past user browser login PASS remains historical evidence | USER/OPERATOR | P1 | Verify named-email Access and Google Web client origin; report configuration only | Cloudflare/Google console access | M3/M4 | BLOCKED_EXTERNAL |
| B19 | Shipping, legal, regulatory and product claims are approved | No owner-signed evidence in the repository | USER/OPERATOR | P0 | Approve shipping costs, privacy/terms/refunds and SKU-specific claims | Finance, legal, food QA | M6/M7 | BLOCKED_EXTERNAL |
| B20 | Production merchant and operations are approved | No production PSP contract, payout/refund drill, canary, on-call or hypercare acceptance | SHARED | P0 | Complete sandbox, finance, security and operations gates before a separate production-provider PR | B03-B19 | M7/M8 | BLOCKED_EXTERNAL |

## Credential policy

Existing project-managed secrets are not modified by engineering work. Values
previously exposed in chat or local untracked files are never read, copied,
logged, committed, or used. Secret state is reported only as `SET`, `MISSING`,
or `UNVERIFIED`.

## Evidence commands

```bash
git rev-parse origin/main
gh pr view 12 --json state,headRefOid,mergeStateStatus,statusCheckRollup,url
gh run list --workflow release-candidate.yml --limit 5
curl -fsS https://api-staging.yubiefood.com/healthz
curl -fsS https://api-staging.yubiefood.com/readyz
ssh -o BatchMode=yes -o ConnectTimeout=10 vps-contabo-yubie-1 \
  'docker ps --format "{{.Names}} {{.Image}} {{.Status}}"'
gh api /orgs/yubiefood-id/packages/container/yubie-api/versions?per_page=1
```
