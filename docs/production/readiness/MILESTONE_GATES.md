# Milestone gates after payment P0

> Historical checkpoint. Current execution evidence and G0–G10 decision: [RELEASE_GO_NO_GO.md](RELEASE_GO_NO_GO.md). Do not treat older source/deployment or Refine status below as current.

**Production decision: NO-GO.** First-party payments stay off. Staging stays on `COMMERCE_PROVIDER=preview`. Main `77a36c1` (CI green, 2026-10-20) is not deployed. Current blocker ownership and the acceptance matrix: `docs/development/execution/BLOCKER_REGISTER_POST_PR11.md`.

Recorded 2026-10-20. PR #11 merged at `84b66033cc53ee3a3180a0658f5923cb0ba83f5b` (2026-10-20T05:20:48Z). Nothing here enables a live provider.

## M1 — payment correctness

| Item | Status |
|---|---|
| Code | branch `fix/payment-p0-intent-promo` (see the PR for the SHA) |
| iPaymu aggregate line at grand total, payable cap | PASS, local |
| Guest principal `guest:<sha256>`, canonical cart hash, migration `0012` | PASS, local Postgres |
| Concurrent submits 2 / 10 / 100 and last-unit | PASS, local Postgres, 0 skipped |
| Ambiguous create, 429 keeps the attempt key, pending UX | PASS, local |
| Callback forged / replayed / wrong merchant, amount, currency, session, reference, status 6 | PASS, local Postgres invariant suite |
| `npm run check` | PASS, 2026-10-20 |
| Persistence with `DATABASE_URL` | 21 pass, 0 fail, 0 skipped |
| Security review of the branch diff | PASS, no blocking finding. Live payments stay disabled |
| Deployed | NOT_RUN. A green CI run is not a deployment |
| Image digest for this SHA | FAIL until a release-candidate workflow runs |

## M2 — iPaymu sandbox

Harness: `scripts/ipaymu-sandbox-probe.mjs` and workflow `iPaymu sandbox probe`. Default is NOT_RUN. A live create happens only on a manual dispatch from `main` with confirm `sandbox`, `expected_sha` equal to the dispatched commit, and the protected `sandbox` environment holding `IPAYMU_SANDBOX_VA` and `IPAYMU_SANDBOX_API_KEY` (the sandbox pair the project already uses; this repo does not rotate it).

The probe reports `CREATE_SESSION_PASS` at best. That is one sandbox create, not payment acceptance. M2 passes only when every step of `docs/production/runbooks/ipaymu-sandbox-e2e.md` has evidence.

Live call: NOT_RUN. BLOCKED_EXTERNAL until the `sandbox` environment with required reviewers and both secrets exists, and iPaymu answers on cancel, lookup, and duplicate references are on record.

## M3 — staging release

BLOCKED_EXTERNAL. Procedure: `docs/production/runbooks/staging-release.md` (RC, backup + restore proof, migrate `0011`–`0013`, verify, schema-compatible rollback to `aa00c53`). Needs owner approval to dispatch the RC for `77a36c1`, operator host access (or redacted operator output), and the backup before migration. Backup atomicity and the checksum-verified restore drill passed locally on PostgreSQL 17 with all migrations through `0013`. Staging still reports `releaseSha=aa00c53`.

## M4 — Refine admin

Design: `ADMIN_BFF_DESIGN.md`. The BFF pages orders and payments through `PostgresAdminReaders` (read-only transactions, no customer PII, proven on PostgreSQL) and returns 503 when a reader fails. Refine is not installed. Staff OIDC, audit, and `ops-staging` are BLOCKED_EXTERNAL. This is not a working admin UI.

## M5 — ERPNext

Design: `ERPNEXT_SYNC_DESIGN.md`. `stockDiscrepancyReport` compares quantities and does not write. `runErpShadowReconcile` adds validated item mappings, a GET-only `Bin` reader, deduped discrepancy events, backoff retries and an operator dead letter, tested against a mock Frappe; it is not scheduled. `erpStockWriteDecision` stays refused. A real ERPNext host is BLOCKED_EXTERNAL. This is not a running ERPNext.

## M6 to M8 — storefront, fulfilment, support, go-live

NOT_RUN. Legal and compliance sign-off, monitoring, and a LIVE credential approval are BLOCKED_EXTERNAL. Marketplace-first remains the production path.

Operator actions stay in `docs/development/execution/OPERATOR_ACTIONS.md` and, once the baseline docs PR is merged, `EXTERNAL_OPERATOR_ACTIONS.md`.
