# Milestone gates after payment P0

**Production decision: NO-GO.** First-party payments stay off. Staging stays on `COMMERCE_PROVIDER=preview`. This branch is not deployed.

Recorded 2026-10-20. Money-path merge is an owner action. Nothing here enables a live provider.

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

BLOCKED_EXTERNAL. Do not start live calls until the owner rotates the exposed key, injects a sandbox pair through the secret store, and sends written answers on cancel, lookup, and duplicate references. An opt-in harness waits until this PR is merged.

## M3 — staging release

BLOCKED_EXTERNAL. Needs a release-candidate digest for the merged SHA, restored SSH or supplied container/migration/backup evidence, an approved dump for the restore drill, and an approved apply of `0011` and `0012` after that backup. Staging still reports `releaseSha=aa00c53`.

## M4 — Refine admin

NOT_RUN. Real paginated BFF, staff OIDC, and audit start only after M1 is merged. No `ops-staging` host until DNS and Access are approved.

## M5 — ERPNext

NOT_RUN. Mapping, outbox, DLQ, and a discrepancy report against a local mock start only after M1 is merged. A real ERPNext host is BLOCKED_EXTERNAL until an isolated host and its cost are approved. Stock writes stay refused.

## M6 to M8 — storefront, fulfilment, support, go-live

NOT_RUN. Legal and compliance sign-off, monitoring, and a LIVE credential approval are BLOCKED_EXTERNAL. Marketplace-first remains the production path.

Operator actions stay in `docs/development/execution/OPERATOR_ACTIONS.md` and, once the baseline docs PR is merged, `EXTERNAL_OPERATOR_ACTIONS.md`.
