# Yubie — E2E Production Release Checklist

**Prepared:** 2026-10-21. **Baseline code:** `fabb8c2b0b7a495867372b89d60a2af547de69cd` (reconfirm before execution). **Known staging from report:** `aa00c53` preview; still requires read-only runtime verification.

## Gates and sign-off ledger

| Gate | Acceptance evidence | Owner | Initial status |
|---|---|---|---|
| G0 Channel/checkout ADR | Written marketplace/direct/dual decision | CEO/Product + Finance | BLOCKED_OWNER |
| G1 CI and code security | `main` CI, merged PRs, SAST/DAST/SBOM, no P0/P1 | Engineering/Security | CI PASS; full QA NOT_RUN |
| G2 Staging artifact | Exact image digest, Worker version, migration 0011–0013, verified off-host backup/restore | SRE/Operator | NOT_RUN |
| G3 Storefront and account | Real staging Playwright desktop/mobile + Google/customer data | Engineering/QA | Historical partial PASS; comprehensive NOT_RUN |
| G4 iPaymu | Real isolated sandbox redirect, callback, cancel/expire, duplicate prevention, settlement, refund | Finance/Provider/Engineering | BLOCKED_EXTERNAL |
| G5 Staff admin | Refine frontend deployed, staff OIDC, RBAC/audit and real backend | Admin/Security | NOT_READY |
| G6 ERPNext | Isolated host, mappings, physical lots/QA, one-way shadow sync and exception handling | Operations | BLOCKED_EXTERNAL |
| G7 Support and fulfillment | Zammad/WhatsApp, B2B, complaints/recalls, shipping/refunds/returns workflows | Operations/CS | NOT_RUN |
| G8 Regulatory/legal | Product evidence packs, BPOM/SPP-IRT as applicable, halal, approved claims, terms/privacy/refunds | Legal/QA/CEO | BLOCKED_OWNER |
| G9 DR and monitoring | Alert delivery, off-host backups, restore drills, SLOs, rollback, PSP drain, hypercare | SRE/Finance | NOT_RUN |
| G10 Release authorization | Explicit signed approval for **exact** SHA, image digests, target environment and checkout mode | CEO/Release manager | NOT_APPROVED |

## Production-readiness notes

- **Current public production domain state was not independently verified:** browser requests from this assistant's environment were blocked. That does not prove the site is down.
- Repository Playwright tests are primarily local/mocked; they are necessary but insufficient for production E2E.
- Source `docs/production/05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md` still says marketplace-owned production checkout. Direct checkout needs a new signed ADR.
- Source product prices: Flour 250g 35,000 / 1kg 120,000; Shake sachet 19,500 / pack7 129,000; Ppang mini 9,000 / maxi 19,000 / pack5 42,000; Mie single 16,000 / pack3 45,000. Finance must approve prices.
- Refine not installed/deployed and ERPNext host not yet verified. Code-level read-only BFF/ERP shadow components do not count as live systems.
- iPaymu official Redirect Payment creates a SessionID and hosted URL. The separate authoritative status/cancel paths must be validated against iPaymu’s actual contract.

## Operator interventions, in order

1. Decide production checkout architecture (marketplace only vs iPaymu direct vs both) and approve shipping/refund policies.
2. Approve immutable release candidate publication and staging backup + isolated restore + migrations; provide a safe audited path to VPS and GHCR evidence.
3. Provide protected sandbox secrets **only in secret store**, confirm fresh/non-exposed pair, and obtain iPaymu written answers and merchant-test approval.
4. Approve a separate isolated PSP sandbox host with publicly reachable callback and disposable database.
5. Approve staff IdP/Google OIDC, Cloudflare Access for ops domain and isolated ERPNext hosting + readonly Frappe API user.
6. Provide Zammad/WhatsApp support account configuration and owner for complaints and food-safety escalation.
7. Obtain SKU-level regulatory/claim approval, legal pages, merchant KYC, approved production payment keys, off-host backup and on-call ownership.
8. Sign the exact release manifest **only after** all required validation evidence passes.

## Test environment taxonomy

- MOCK_LOCAL: fast CI/browser confidence only, no real PSP, not financial acceptance.
- STAGING_REAL: actual Cloudflare→Contabo→Postgres E2E and authorized test users; no real money.
- ISOLATED_PSP_SANDBOX: provider-backed iPaymu transaction, callback, reconciliation, refunds as available.
- PRODUCTION_READ_ONLY: safe domain/media/security/UX checks only.
- CONTROLLED_LIVE_PILOT: signed finance-approved small live transaction after full gates pass.

**Automatic blocking rule:** any P0/P1 defect, skipped required test, unknown payment outcome, missing human approval or failed backup/restore yields **NO-GO**.
