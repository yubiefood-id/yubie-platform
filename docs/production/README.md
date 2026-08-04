# Yubie Production Engineering Handbook

This directory is the production contract for Yubie. It translates the product goals into build order, controls, operating procedures, evidence, and launch gates.

## How to use it

- Product and engineering work starts from the applicable document here.
- A pull request links to the relevant requirements and updates the document when behavior changes.
- A production release is approved against the go-live checklist, not intuition.
- Regulatory statements are operational guidance, not legal advice. Yubie's accountable regulatory/food-safety owner must verify the exact product, entity, channel, and effective law before launch.

## Document map

| Document | Purpose |
|---|---|
| [`00_PRODUCTION_READINESS_MODEL.md`](./00_PRODUCTION_READINESS_MODEL.md) | Readiness dimensions, environments, ownership, evidence |
| [`01_PRODUCT_TRUTH_AND_FOOD_COMPLIANCE.md`](./01_PRODUCT_TRUTH_AND_FOOD_COMPLIANCE.md) | Product facts, claim governance, lots, release, recall, Indonesian regulatory watchpoints |
| [`02_TARGET_SYSTEM_ARCHITECTURE.md`](./02_TARGET_SYSTEM_ARCHITECTURE.md) | Runtime topology, trust boundaries, sync/async patterns |
| [`03_DATA_MODEL_AND_PERSISTENCE.md`](./03_DATA_MODEL_AND_PERSISTENCE.md) | Canonical entities, constraints, migrations, retention, backup |
| [`04_API_AND_INTEGRATION_CONTRACTS.md`](./04_API_AND_INTEGRATION_CONTRACTS.md) | API conventions, idempotency, errors, webhooks, adapters |
| [`05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md`](./05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md) | Transaction state machines, reconciliation, FEFO, returns/refunds |
| [`06_SECURITY_PRIVACY_AND_ACCESS.md`](./06_SECURITY_PRIVACY_AND_ACCESS.md) | Threat model, access, secrets, payment scope, PDP controls |
| [`07_RELIABILITY_OBSERVABILITY_AND_SLOS.md`](./07_RELIABILITY_OBSERVABILITY_AND_SLOS.md) | SLIs/SLOs, telemetry, alerts, dependency behavior |
| [`08_CI_CD_AND_RELEASE_ENGINEERING.md`](./08_CI_CD_AND_RELEASE_ENGINEERING.md) | CI, environments, migration/release/rollback policy |
| [`09_TESTING_AND_QUALITY_STRATEGY.md`](./09_TESTING_AND_QUALITY_STRATEGY.md) | Risk-based test pyramid and production verification |
| [`10_ANALYTICS_EXPERIMENTATION_AND_GROWTH.md`](./10_ANALYTICS_EXPERIMENTATION_AND_GROWTH.md) | Event governance, consent, funnels, experiment guardrails |
| [`11_B2B_CRM_AND_OPERATOR_OPERATIONS.md`](./11_B2B_CRM_AND_OPERATOR_OPERATIONS.md) | Lead/sample workflow, support and internal tools |
| [`12_INCIDENT_RESPONSE_AND_RUNBOOKS.md`](./12_INCIDENT_RESPONSE_AND_RUNBOOKS.md) | Technical, payment, privacy, fulfilment and food-safety incidents |
| [`13_PRODUCTION_DELIVERY_ROADMAP.md`](./13_PRODUCTION_DELIVERY_ROADMAP.md) | Sequenced epics from current foundation to GA |
| [`14_GO_LIVE_CHECKLIST.md`](./14_GO_LIVE_CHECKLIST.md) | Final evidence-based launch decision |
| [`15_CAPACITY_COST_AND_VENDOR_GOVERNANCE.md`](./15_CAPACITY_COST_AND_VENDOR_GOVERNANCE.md) | Load envelopes, cost controls, vendor due diligence and exit plans |

## Decision principles

1. Prefer correctness and recoverability over cleverness.
2. Keep the synchronous purchase path short; move slow integrations behind durable delivery.
3. Buy regulated/commodity capabilities; build Yubie's differentiating product, claim, lot, and customer experience.
4. Scale architecture after measured pressure, not before it.
5. Every critical control needs an owner, automated signal where possible, and a recovery procedure.

## External references

The current regulatory watchpoints were checked on 2026-08-04 against official sources including [BPOM's registration portal](https://registrasipangan.pom.go.id/), [BPOM's legal database](https://jdih.pom.go.id/), [BPJPH's October 2026 guidance](https://bpjph.halal.go.id/read/wajib-halal-oktober-2026-momentum-pelaku-usaha-tingkatkan-daya-saing), Indonesia's [Personal Data Protection Law No. 27/2022](https://jdih.komdigi.go.id/produk_hukum/view/id/832/t/undangundang%2Bnomor%2B27%2Btahun%2B202), and [Bank Indonesia payment-system licensing guidance](https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/perizinan/default.aspx).
