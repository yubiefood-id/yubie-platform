# Full-platform release decision — NO-GO

Recorded 2026-10-21 Asia/Bangkok (browser evidence timestamps use UTC). This ledger supersedes historical readiness claims for this execution. The two user-supplied release prompts/checklist are unchanged. Nothing in this report authorizes a production deployment or real-money payment.

## Source and environments

Baseline/current verified GitHub main: `fabb8c2b0b7a495867372b89d60a2af547de69cd`, [five successful CI jobs](https://github.com/yubiefood-id/yubie-platform/actions/runs/39441451255). The working branch adds fixes and tests; final reviewed SHA and CI receipt must be attached before promotion. A local dirty tree is not an immutable release artifact.

Staging API independently reported `aa00c53fe543f385eff4237ceeb1a27fdc878fd4`; readiness reported PostgreSQL connected and `commerceProvider=preview`. Storefront Access redirects to the configured Cloudflare Access tenant. Staging is behind main. No new staging artifact was deployed during this execution. No remote migration was run. Published image digests, Worker version, applied migrations and off-host recovery evidence are unverified.

Production `https://yubiefood.com` is the existing Vercel static storefront; `www` redirects to apex. Vercel associates its deployment with main, but HTTP does not expose a verifiable source identity. The static deployment lacks dynamic auth/checkout endpoints and metadata routes. Cloudflare Worker is the intended dynamic web target under ADR-012 and the approved implementation direction; DNS/runtime cutover requires a reviewed manifest and release authorization.

## Gate ledger

| Gate | Verdict | Evidence and exact next action | Accountable owner / sign-off |
|---|---|---|---|
| G0 Business model | BLOCKED_OWNER | Dual channel selected in the implementation direction; sign the channel ADR, PSP choice, shipping/refund policies and prices. Existing Xendit/iPaymu and marketplace documents require reconciliation. | Product + Finance; unsigned |
| G1 Source/CI/security | PARTIAL | Baseline CI passed. New source needs its own reviewed PR, all five CI jobs, source/image SBOMs and artifact scans. Local mock/DB passes cannot close this gate. | Engineering + Security; unsigned |
| G2 Supply chain/staging | FAIL / BLOCKED_EXTERNAL | Staging SHA differs from main. Publish reviewed immutable RC, verify registry digests/Worker version, obtain audited host access, off-host backup and isolated restore before migrations through 0014. | SRE; unsigned |
| G3 Customer | FAIL / BLOCKED_EXTERNAL | Production read-only browser found endpoint/SEO/layout failures. Staging real access is blocked; customer Google identities and real account/order ownership acceptance unavailable. Retest deployed reviewed artifact on all four browsers. | QA + Product; unsigned |
| G4 Financial | PARTIAL / BLOCKED_EXTERNAL | Real local PostgreSQL concurrency/recovery evidence exists; PSP-backed callback/refund/settlement matrix has not run. Sandbox keys, written contract, isolated callback host/database and Finance test method required. LIVE remains prohibited. | Finance + iPaymu + Engineering; unsigned |
| G5 Admin | PARTIAL / BLOCKED_EXTERNAL | Local Refine UI, separate staff auth, RBAC, revocation/audit and real PostgreSQL readers tested. No ops host, Access policy or approved staff identities deployed. CRM/support summaries, trends/export and approved reconciliation controls are NOT_IMPLEMENTED. | Admin + Security; unsigned |
| G6 ERP | BLOCKED_EXTERNAL | Pinned isolated-host deployment contract prepared, not provisioned. Approve resources/cost, site/schema/roles and operational fixtures. Run native procurement/manufacturing/QA/fulfillment/accounting and GET-only shadow reconciliation. | Operations + Finance; unsigned |
| G7 Support/fulfillment | BLOCKED_EXTERNAL | No approved Zammad/WhatsApp test identity/channel; no real inbound/outbound or fulfillment/return receipt. Assign named operations and food-safety owners, then execute acceptance. | Operations + Customer Support; unsigned |
| G8 Compliance | BLOCKED_OWNER | Exact SKU evidence packs, claims/label approvals, Indonesian legal/privacy/shipping/refund review and merchant KYC absent. Automation cannot sign these. | Legal + QA + Finance; unsigned |
| G9 Release operations | BLOCKED_EXTERNAL | Actual off-host encrypted restore/RPO/RTO, alert delivery, payment drain/late callback rollback and finance reconciliation receipts absent. Counters and local restore tests are insufficient. | SRE + Finance; unsigned |
| G10 Human release authorization | NOT_APPROVED | No signed approval naming final SHA/digests, Worker version, domain/environment, payment mode, window, approvers, rollback and hypercare owners. | Release owner; unsigned |

A blocked, missing, skipped, historical-only or partial mandatory gate is not PASS. No alternative marketplace-only GO is inferred from the dual-channel request.

## Promotion containment

Main now requires the five CI checks, strict branch currency, an independent approving review, stale-review dismissal and resolved conversations; administrator bypass is disabled. Staging, sandbox and Production environments require named review with self-review prevented and protected branches. The Vercel project update disabling automatic alias assignment and ignoring production builds was accepted by the connector; its filtered read response does not independently prove those settings. Repository `vercel.json` disables Git deployments from main after merge. No DNS, active deployment, production payment mode or shared VPS service was changed. Reconfirm containment through the provider UI before merge; repository settings alone do not control an external deployer.

## Reproduction and continuation

Use `E2E_TEST_INVENTORY.md` for commands/tier boundaries, `RELEASE_BLOCKER_REGISTER.md` for ownership, `FINANCIAL_PAYMENT_ACCEPTANCE.md` for PAY-01–20 and `ADMIN_ERP_SUPPORT_ACCEPTANCE.md` for operational acceptance. Task state is in Beads epic `yubie-fnf`; these documents are evidence, not a replacement task tracker.

The next release step is reviewed source/CI, followed by operator-authorized immutable staging publication and backup/restore verification. G10 is required separately for production; this implementation request is not G10 authorization.
