# 00 — Production Readiness Model

## 1. Readiness dimensions

Yubie uses five independent gates. A release is blocked when any required dimension is red.

| Dimension | Green means | Accountable owner |
|---|---|---|
| Product truth | Exact SKU facts and artwork are evidenced and approved | Product/Regulatory owner |
| Food operations | Released lots, storage, FEFO, complaints and recall are operational | Food-safety/Operations owner |
| Transaction integrity | Orders, payments, inventory and fulfilment are idempotent and reconcilable | Engineering + Finance/Ops |
| Platform reliability | Security, privacy, SLOs, backup, restore and incident controls verified | Engineering/SRE |
| Business operations | Support, refunds, fulfilment, finance and vendor escalation staffed | Business/Ops owner |

## 2. Evidence levels

- **Planned:** documented intent only.
- **Implemented:** code/config/process exists.
- **Verified:** test or exercise demonstrates intended behavior.
- **Operational:** owner, monitoring, runbook and recent evidence exist.

Production requires **verified** for all launch controls and **operational** for critical transaction, privacy, product-safety, and recovery controls.

## 3. Environments

| Environment | Data | External side effects | Purpose |
|---|---|---|---|
| Local/test | synthetic | mocks/sandboxes | fast development and deterministic tests |
| Preview | synthetic, isolated | sandbox providers only | review UI/API and migrations |
| Staging | production-like synthetic | provider sandbox/test mode | end-to-end, load, recovery, reconciliation exercises |
| Production | real | live providers | customer and operator use |

Never copy production personal data into lower environments. Use generated fixtures with realistic shape and intentionally fake identities.

## 4. Ownership model

Every critical subsystem has:

- a directly responsible owner and backup;
- service description, dependencies, dashboards and runbook;
- SLO or operational KPI;
- data classification and retention rule;
- provider escalation and exit plan;
- recent recovery or incident exercise.

## 5. Change classification

| Risk | Examples | Required controls |
|---|---|---|
| Low | copy/layout with no protected product facts | review, preview, automated tests |
| Medium | API response, analytics event, operator workflow | contract tests, migration review, staged rollout |
| High | checkout, payment, inventory, consent, access | independent review, integration/failure tests, rollback, monitoring |
| Critical | label/claim, lot release, recall, settlement logic | domain owner approval, evidence, exercise, explicit go/no-go |

## 6. Release evidence packet

Each production release records commit, artifact, migrations, approvers, changed flags/config, test results, security/dependency status, rollout plan, dashboards, rollback/roll-forward instruction, and post-release outcome. Food-product releases additionally record specification, artwork, evidence, lot, expiry/storage basis, and regulatory approvals.
