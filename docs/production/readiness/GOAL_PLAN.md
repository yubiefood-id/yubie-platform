# Production readiness goal plan

Goal: take first-party checkout from merged code (`6a2f451`) to a production go/no-go without real-money exposure before every gate passes. Marketplace-first ([ADR-004](../ADR-004_MARKETPLACE_WHATSAPP_FIRST.md)) stays the rollback path, and `COMMERCE_PROVIDER=preview` stays the kill switch.

Each milestone is a separate PR. Money-path PRs are merged by the owner, never auto-merged. Each milestone report states the commit SHA, image digest (or why none exists), test counts, blockers, human actions, and GO/NO-GO.

| Milestone | Scope | Entry condition | State |
|---|---|---|---|
| M0 | Baseline reconciliation and these docs | none | this PR |
| M1 | Payment P0 correctness: promo/shipping amounts, guest intent, concurrent claim, ambiguous recovery, invariant suite on Postgres | M0 merged | in progress (`fix/payment-p0-intent-promo`) |
| M2 | iPaymu sandbox live matrix | M1 merged, key rotated, sandbox pair injected through the secret store, written provider answers | BLOCKED_EXTERNAL |
| M3 | Staging release: RC digest for merged SHA, restore drill, `0011`/`0012` applied after backup, observability, CI security gates | M1 merged, VPS access restored | BLOCKED_EXTERNAL |
| M4 | Refine admin backed by Postgres, staff OIDC allowlist, audit, dual approval for refunds and price changes | M1 merged | NOT_RUN |
| M5 | ERPNext mapping and sync design (outbox, DLQ, discrepancy report) against a local mock | M1 merged | NOT_RUN; a real instance is BLOCKED_EXTERNAL |
| M6 to M8 | Storefront, fulfilment, support, compliance acceptance, production go/no-go, hypercare | M2 to M5 | NOT_RUN |

Related execution records (not duplicated here):

- [STAGING_E2E_MASTER_PLAN](../../development/execution/STAGING_E2E_MASTER_PLAN.md)
- [STAGING_E2E_ACCEPTANCE](../../development/execution/STAGING_E2E_ACCEPTANCE.md)
- [PAYMENT_THREAT_MODEL](../../development/execution/PAYMENT_THREAT_MODEL.md)
- [IPAYMU_PROVIDER_CONTRACT](../../development/execution/IPAYMU_PROVIDER_CONTRACT.md)
- [RISK_REGISTER](../../development/execution/RISK_REGISTER.md)
- [STAGING_HANDOFF](../../development/execution/STAGING_HANDOFF.md)
