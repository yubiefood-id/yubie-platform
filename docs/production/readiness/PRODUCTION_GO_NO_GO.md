# Production go/no-go

**Decision: NO-GO.** 2026-10-20T04:50Z, on `6a2f451`.

First-party payments stay off. Production stays marketplace-first and staging stays on `COMMERCE_PROVIDER=preview`.

## Reasons

1. Financial invariants F1 to F5 are open in merged code. See [FINANCIAL_INVARIANTS](FINANCIAL_INVARIANTS.md). YUBIE15 and paid-shipping orders cannot be paid through iPaymu, and guests can create duplicate intents.
2. No release-candidate image exists for `6a2f451`. Staging runs `aa00c53`.
3. The staging migration state, running image digests, and backups could not be verified (O4, O5).
4. The iPaymu sandbox matrix has not run live (O1 to O3).
5. No restore drill has been run for this release.
6. Admin is an undeployed BFF with no real order data. ERPNext is a read-only shadow client with no server.
7. Compliance and legal acceptance has not started (O12).

## Gate checklist

| Gate | Status |
|---|---|
| F1 to F8 enforced by tests on Postgres, in CI | FAIL (F1 to F5 open) |
| RC image digest for the merged SHA | FAIL |
| Staging runs the RC digest, migrations verified | BLOCKED_EXTERNAL |
| Verified backup and restore drill | BLOCKED_EXTERNAL |
| iPaymu sandbox matrix live | BLOCKED_EXTERNAL |
| Security review of money path | NOT_RUN for M1 |
| Admin with real data, staff OIDC, audit | NOT_RUN |
| ERP governed integration | NOT_RUN |
| Monitoring: pending age, webhook lag, correlation IDs | NOT_RUN |
| Legal and compliance sign-off | BLOCKED_EXTERNAL |
| LIVE credential approval | BLOCKED_EXTERNAL |

Rollback at every stage: revert the PR, keep `COMMERCE_PROVIDER=preview`, keep the Xendit adapter, restore the database from a pre-migration backup (never a volume delete).
