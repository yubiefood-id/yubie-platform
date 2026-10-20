# Milestone gates after payment P0

**Production decision: NO-GO.** First-party payments stay off. Staging stays on `COMMERCE_PROVIDER=preview`. Main `84b6603` is not deployed.

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

Harness: `scripts/ipaymu-sandbox-probe.mjs` and workflow `iPaymu sandbox probe`. Default is NOT_RUN. A live create happens only on a manual dispatch with confirm `sandbox` plus secrets `IPAYMU_SANDBOX_VA` and `IPAYMU_SANDBOX_API_KEY`.

Live call: NOT_RUN at 2026-10-20T05:25:00Z. BLOCKED_EXTERNAL until the owner rotates the exposed key, injects that pair, and sends written answers on cancel, lookup, and duplicate references.

## M3 — staging release

BLOCKED_EXTERNAL. Needs a release-candidate digest for the merged SHA, restored SSH or supplied container/migration/backup evidence, an approved dump for the restore drill, and an approved apply of `0011` and `0012` after that backup. Staging still reports `releaseSha=aa00c53`.

## M4 — Refine admin

Design: `ADMIN_BFF_DESIGN.md`. The BFF pages orders through an injected reader and labels a missing reader `unconfigured`. Refine is not installed. Staff OIDC, audit, and `ops-staging` are BLOCKED_EXTERNAL. This is not a working admin UI.

## M5 — ERPNext

Design: `ERPNEXT_SYNC_DESIGN.md`. `stockDiscrepancyReport` compares quantities and does not write. `erpStockWriteDecision` stays refused. A real ERPNext host is BLOCKED_EXTERNAL. This is not a running ERPNext.

## M6 to M8 — storefront, fulfilment, support, go-live

NOT_RUN. Legal and compliance sign-off, monitoring, and a LIVE credential approval are BLOCKED_EXTERNAL. Marketplace-first remains the production path.

Operator actions stay in `docs/development/execution/OPERATOR_ACTIONS.md` and, once the baseline docs PR is merged, `EXTERNAL_OPERATOR_ACTIONS.md`.
