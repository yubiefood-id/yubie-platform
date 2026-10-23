# Yubie Fast-Track Production — Minimum Safe Production (MSP)

**Date:** 2026-10-21 | **Repository:** https://github.com/yubiefood-id/yubie-platform | **Verified source baseline:** `d321c131d0fe2d9d6fc8b0e2e532b1d9c132dcd3`

**Status:** CI/source green; live direct checkout NO-GO. This plan is not permission to deploy or activate live money.

## 0. Evidence and limits

- PR #20 merged, 5/5 required CI jobs passed on main; no new release-candidate run on the observed recent workflow list (last observed published RC still `aa00c53`).
- Staging last attested on `aa00c53`, `COMMERCE_PROVIDER=preview`; treat as historical until independently rechecked.
- Vercel connector GET of `https://yubiefood.com` (2026-10-21): `/`, `/products`, `/cart`, `/checkout`, `/login`, `/account` return HTTP 200. `/api/auth/session`, `/api/checkout/session`, `/robots.txt`, `/sitemap.xml` return HTTP 404. HTML still contains obsolete `yubie.id` canonical/OG links and `codex-preview=development` metadata.
- Existing `docs/production/05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md` calls marketplace the production channel; newer `RELEASE_GO_NO_GO.md` describes a dual-channel intent. The product owner MUST decide and sign the scope; code/tests alone do not resolve the contradiction.
- PR #20 improvements: durable checkout retry, provider exception handling, private Refine UI, browser matrix, security and container fixes. Local mocks/PG are **not** provider-backed or deployed acceptance.
- The attached earlier project audit is historical, not an executable order.

## 1. Three explicit launch profiles (not one massive GO/NO-GO)

### A — PUBLIC_CATALOG / MARKETPLACE_MSP — fastest, recommended NOW

- Public product pages for four families and nine variants, approved prices/availability, approved product claims, transparent shipping/returns/terms/privacy, SEO, responsive design, official support contact.
- Checkout ownership: an independently verified marketplace seller listing, with stock/payment/refunds managed by that marketplace. Do not create first-party Yubie orders on this path, and do not suggest Yubie can cancel marketplace orders.
- If no approved live marketplace URL/contact exists, fall back to **PUBLIC_CATALOG_NO_SALES**: product catalog + B2B/contact enquiry only; no purchasable CTAs, payment session, preview 'Pay' button, or false order confirmations.
- Admin: marketplace seller center + lightweight operations log/owner may suffice; Refine and ERPNext are non-gating for this profile if no Yubie-managed financial/stock workflow is advertised.
- Infra: safely reuse the existing Vercel/static deployment if corrected catalog-only pages can be deployed there with all dynamic/login/cart/payment paths disabled or explicitly unavailable. Alternatively use Cloudflare Worker if its staging is actually green. Do NOT incur DNS cutover merely to release a catalog.
- Mandatory minimum: signed SKU/evidence/claims & legal review; verified marketplace/contact destination; customer-safe navigation/mobile/a11y; no broken action paths; HTTPS, safe headers/analytics/consent; observable uptime/error reporting, canary/rollback; exact artifact and owner authorization.

### B — DIRECT_IPAYMU_MSP — customer money held to stronger gates

- Yubie owns checkout, order, stock reservation and fulfillment; iPaymu holds payment/settlement; all callbacks/settlement/refunds and replay handling must be verified on isolated provider sandbox.
- Backups/isolated restore, real DB migration 0011–0014 compatibility, release digest, duplicate/capture/retry/late callback invariants, actual provider contract recovery semantics, pending-age alerts and on-call escalation, shipping/returns and finance sign-off.
- A reliable minimum **operator console** is required: either approved private Refine with real read-only order/payment/exception/inventory plus documented manual controlled refund/reconciliation workflow; or another secure auditable operations system with equivalent features. CRM trend/export and ERP-native accounting can wait if Finance signs a controlled alternative.
- No exposed keys, no live PSP host before independent written approval; `COMMERCE_PROVIDER=preview` remains on shared staging. The sandbox runs on an isolated host/database.

### C — FULL_OS (after B or independent ops rollout)

- ERPNext on isolated host, BOM/procurement/manufacturing/QA/lot+expiry, read-only shadow sync before any stock write, separate stock authority, Refine full admin/analytics/approval, Zammad+WhatsApp bot/inbox, automated finance and operating dashboards.
- This is not a prerequisite for A; for B, only operational capabilities that replace essential safety/financial controls are gating. Never call FULL_OS complete when modules are placeholders.

## 2. Critical path (the shortest safe path)

| Phase | Work | Exit evidence | Owner |
| --- | --- | --- | --- |
| F0 Freeze scope (0.5 day planning, estimate) | Sign ADR for A/B/C and verified marketplace links, customer support, active SKU/claims | ADR+SKU approval; unavailable routes off | CEO/Product/QA/Finance |
| F1 Artifact + staging | Review merged delta; update runbook for 0014/four images; publish immutable RC; backup and isolated restore; deploy staged preview; verify exact SHA/digest/Worker | CI 5 green, RC image digests, backup/restore receipt, migrated schema, `/healthz` same SHA | SRE + engineer, remote approvals |
| F2 Browser hardening | Run Chromium/Firefox/WebKit mobile across all 4 products, 9 variants, CTA modes, login only if offered, privacy/terms, contact/B2B; fix bugs+regressions | **STAGING_REAL** no fake mocks; 0 P0/P1 open, mobile overflow 0, non-working CTA 0 | QA + product |
| F3 Production route A | Verify official destinations; deploy catalog-only to selected target, smoke read-only and synthetic CTA, set robots/sitemap/canonical, watch errors; rollback drill | Live endpoint matrix, release manifest, on-call, legal sign-off, signed exact SHA | Release owner |
| F4 Payment B (parallel but never bypass) | fresh sandbox creds/contract; isolated sandbox; 10-step runbook; financial recovery/settlement/refund and alert drills; staff ops capability; Fin sign-off | PAY provider-backed receipts and no unresolved money outcomes | Finance + PSP + Payments |
| F5 FULL_OS (parallel/on demand) | Staff private Refine, isolated ERPNext, Zammad/WhatsApp and physical stock authority | Real operational flows and ownership sign-off | Ops + CS + Finance |

Timeline estimates depend on operator/provider readiness; never promise dates. **Dependency-based sequencing**: F0→F1→F2→F3; F4/F5 separate lanes.

## 3. Minimal topology and authority

- Public catalog: Vercel static (only if non-working dynamic commerce UI is disabled) **or** Cloudflare Worker (after verified deployed Worker acceptance). Do not run two public origins serving conflicting auth/checkout state.
- Staging: Cloudflare Access → Worker frontend → same-origin proxy → Contabo API → PostgreSQL; `preview` mode. Dedicated isolated iPaymu sandbox environment, NEVER shared prod or staging DB.
- Payment B: Authoritative provider settlement and payment IDs, durable Yubie order/payment/exception and reservation; retry resolves existing attempt, doesn't blindly create again.
- Admin: browser → private Access/MFA → staff OIDC → Refine BFF RBAC → read-only PostgreSQL reader, no client DB credentials. Dangerous changes require audited approval; if absent, manual Finance procedure and disable controls.
- ERPNext: separate host/schema and credentials; ERP owns physical lots when enabled; Yubie owns reservations. Shadow read-only first. No unsupervised dual-master writes.
- Never touch RetroPick containers, shared Caddy routes or secrets while deploying Yubie.

## 4. What can be cut / what cannot

**Cut for A:** iPaymu production adapter, refund/settlement inside Yubie, live Refine host, ERPNext provisioning, Zammad integration, AI chatbot, advanced metrics dashboards, CRM trends/export, manufacturing automation, internal checkout/order history. If features already exist, hide or disable them **server-side** for A rather than suggesting they work.

**Never cut:** correct SKU/claims/legal approval, functional and verified purchase destination/contact, secure redirects, no false payment state, access controls on any real endpoints, dependency/security scan, actual deployment validation, backup/rollback of any component with state, operator escalation, precise artifact ownership and production authorization.

## 5. Existing bugs to address for A

1. Live public dynamic API session and checkout endpoints are 404. Either deploy a validated Worker stack or remove/disallow dynamic flows in catalog-only mode; do not leave a Pay CTA to a broken route.
2. `/robots.txt` and `/sitemap.xml` are 404; obsolete canonical & OG URLs to `yubie.id` need correction to `yubiefood.com` and an SEO content review.
3. Prior 320px overflow on homepage/Flour (source PR #20 fix must be checked on deployed artifact).
4. Verify actual marketplace deep links / customer support contact. Staging purchase options were empty; do not invent redirect URLs or unverified phone numbers.
5. Confirm all variant prices and nine SKUs are still correct, photographed assets are approved, unverified nutrition/medical claims suppressed.
6. Confirm privacy/terms/shipping/refund and newsletter/B2B actual backend behavior. Failure feedback and consent persistence must be honest.

## 6. RACI / owner actions

- **Can Codex do now locally:** source review, flags and fail-closed routes, SEO corrections, test coverage, QA scripts, accessibility and responsive fixes, production-specific build, read-only dependency audit, draft ADR/runbooks/PR, produce canary/rollback plan and release manifest template.
- **Operator explicit approval needed:** reviewed SHA RC publication; all SSH/Cloudflare/GHCR access; backups, migrations, staging/production deployment, DNS/Vercel routing changes, Access policy, and release cutover.
- **Product/QA/Legal sign-off needed:** per-SKU evidence/claims/regulatory scope, final approved content, verified marketplace links, contact identity, shipping/refund/terms/privacy, incident owner.
- **Payment B external:** rotate iPaymu VA/key into protected secret manager, provider answers about cancel/lookup/reference/recovery/MAC, KYC/payout/refund/settlement, isolated sandbox, Finance acceptance.
- **FULL_OS external:** isolated ERP host/cost, approved mapping and production formula/BOM/QA workflow; Zammad/Meta WhatsApp credentials and test identities.

## 7. Real acceptance matrix

- **A (catalog/marketplace)**: `SOURCE_CI_PASS`, `STAGING_CATALOG_E2E_PASS`, `ALL_9_SKUS_PASS`, `MOBILE_ACCESSIBILITY_PASS`, `ALL_PURCHASE_LINKS_VERIFIED_OR_HIDDEN`, `NO_FIRST_PARTY_PAYMENTS_EXPOSED`, `APPROVED_PRODUCT_CONTENT`, `LEGAL_PAGES_PASS`, `SUPPORT_PATH_PASS`, `PROD_CANARY_AND_ROLLBACK_PASS`, `RELEASE_OWNER_APPROVED`. If no verified marketplace route, release profile must be CATALOG_NO_SALES.
- **B (direct payment)**: all A gates + `REAL_STAGING_CHECKOUT_PASS`, `REAL_DB_MIGRATIONS_AND_RESTORE_PASS`, `PSP_SANDBOX_PROVIDER_PASS`, `REFUND_SETTLEMENT_PASS`, `PENDING_ALERT_DELIVERY_PASS`, `FINANCE_APPROVED`, `SECURE_OPERATOR_WORKFLOW_PASS`, `SIGNED_B_EXPLICIT_GO`.
- **C (full OS)**: live private staff, ERP physical stock authority/shadow convergence, support and fulfillment traceability, backup/restore for every stateful system, and operations sign-off.

## 8. Stop/rollback

- Stop immediately for unowned customer funds, suspicious double-capture, weak auth, product safety claims without approval, missing backup of stateful migrations, and unknown production artifact identity.
- In B, pause new checkout before any rollback; preserve/inspect in-flight payment and provider callbacks; do not overwrite an active database, delete volumes, or re-enable old code without compatibility verification.
- In A, rollback the exact static/Worker version and DNS alias if authorized; monitor error rate + purchase-link clicks and customer support incidents.
- Production approval must name profile (A, B, C), exact source SHA, artifact digest, environment/domain, change window, human approvers and on-call.
