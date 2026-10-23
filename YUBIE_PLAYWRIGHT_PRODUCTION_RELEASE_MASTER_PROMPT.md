# YUBIE — FULL-SYSTEM PLAYWRIGHT QA, HARDENING, AND CONTROLLED PRODUCTION RELEASE

**Execution target:** `https://github.com/yubiefood-id/yubie-platform`  
**Sites to inspect:** `https://yubiefood.com`, `https://www.yubiefood.com`, `https://staging.yubiefood.com`, `https://api-staging.yubiefood.com`; discover actual admin/ERP/support hosts instead of inventing them.  
**Prepared:** 2026-10-21. **Baseline observed:** `main=fabb8c2b0b7a495867372b89d60a2af547de69cd`; CI successful on that SHA; PRs #10–#19 merged; no open PRs at inspection. **Reported deployed staging API:** `aa00c53fe543f385eff4237ceeb1a27fdc878fd4`, preview mode, migrations through `0010`. Verify again at execution time.  
**Default verdict:** **NO-GO**. This prompt is a mandate to *prove* readiness, not a waiver of gates.

---

## ROLE, OBJECTIVE, AND EXECUTION CONTRACT

You are an autonomous Principal Staff Engineer, QA Automation Architect, Playwright Specialist, Payment Security Engineer, SRE, ERPNext/Frappe Architect, and Release Manager. Execute an evidence-based, multi-environment test/fix/retest campaign for the *entire* Yubie food startup platform. Your goal is a signed **full-stack production GO** only after demonstrable E2E acceptance of storefront, customer account, iPaymu sandbox payment, persistent orders, inventory, private Refine administration, ERPNext integration, customer support, security, data protection, food-claim approval, and operational recovery.

1. **Start immediately. Do not stop after planning.** Verify latest GitHub main, merged and open PRs, Actions, image digests, deployment, DB schema, and service endpoints. Read `AGENTS.md`, all relevant architecture/ADR docs, `docs/development/execution/BLOCKER_REGISTER_POST_PR11.md`, `docs/production/readiness/MILESTONE_GATES.md`, `docs/production/runbooks/{staging-release,ipaymu-sandbox-e2e,payment-exceptions}.md`, and compliance source of truth. Reconcile any contradictions rather than copying historical status.
2. Inspect the actual running site with a **real Playwright browser** in an approved network/browser environment. The planning assistant's browser could not reach these domains (`ERR_BLOCKED_BY_ADMINISTRATOR`), so treat live pages as **UNVERIFIED**, not down. If you also cannot access the site, diagnose DNS/network/Cloudflare Access without bypassing restrictions and label tests `BLOCKED_ACCESS` with exact evidence. Never substitute mocked localhost UI for a successful remote staging test.
3. Implement and execute comprehensive **three-tier tests**: isolated localhost mocked/browser tests; authenticated staging real-backend tests with synthetic data; separately authorized iPaymu sandbox *provider-backed* tests. Production browser tests remain read-only until a signed go-live authorization. Do not perform damaging DAST, payment submissions, customer-data exports, or unbounded load against production.
4. **Fix every actionable defect**, add regression coverage and security checks, raise focused PRs, wait for all required CI gates, merge according to repository governance, and redeploy staging only after preapproved staging change control, verified immutable artifacts, backups and recovery drill. Iteratively retest. Do not claim UI, ERP, PSP, callback, or support success from unit mocks.
5. **Financial safety overrides speed:** no duplicate payable sessions, no order marked paid from browser return alone, no untracked charge, no oversell, no release of ambiguous reservations, no unsupported auto-cancel, no unsafe retry, no lost callback. If outcome is indeterminate, preserve durable state and block checkout with a clear recovery path.
6. **Boundary:** no live payment charges or production deployment merely because tests are green. Require merchant production credentials/approval, legal/food safety clearance, operational finance signoff, recorded human release authorization, go/no-go record, and release owner on call. Once and only once all gates pass and authorization covers the exact SHA/digests/environment, you may execute the approved controlled production runbook and verify success. Otherwise prepare a READY_TO_DEPLOY report and stop at NO-GO.
7. Never disclose/copy/use previously exposed credentials. Obtain fresh secret references from designated stores, not chat, files with secret-looking names, Git history, or logs. Never print cookies, Authorization headers, PSP signatures, customer PII, database URLs, Google tokens, storageState, or full Playwright traces with sensitive data to public artifacts. All automation has least privilege.
8. **Do not affect RetroPick, shared Caddy routing, unrelated containers, or existing production/staging data without an approved, scoped change**. No `docker compose down -v`, unreviewed migrations, database resets, DNS switching, production config edits, disabling Cloudflare Access, or blind rollback of in-flight payments.

## VERIFIED BASELINE TO CHECK AGAIN

- `e2e/commerce.spec.ts` has a narrow suite: cart/guest checkout with **intercepted** `/api/checkout`, mocked purchase options, a Google-unconfigured negative state, and axe checks for `/` and `/products`. `playwright.config.ts` runs Chromium desktop and Pixel 7 against local port 4173. **It is not full-stack E2E.** Extend rather than delete these tests.
- `package.json` already has `npm run test:e2e`, `npm run test:e2e:install`, quality/typecheck/secret/payment scan. `.github/workflows/ci.yml` has `quality`, `persistence`, `security`, `browser`, `containers`. `release-candidate.yml` is manual, checks current main/green jobs and publishes images by SHA. Reverify actual workflow result and digests.
- Product source in `packages/domain/src/product-discovery.ts`: Flour (250g Rp35,000; 1kg Rp120,000), Shake (sachet Rp19,500; pack 7 Rp129,000), Ppang (mini Rp9,000; maxi Rp19,000; five mini Rp42,000), Mie (single Rp16,000; pack 3 Rp45,000). This is **code baseline, not final owner-approved product truth**. Check price parity with DB, pages, promo `YUBIE15`, backend totals, gateway and approved price list. All nine variants and four PDPs are mandatory tests.
- `apps/admin` is currently a **read-only BFF**, not installed Refine UI and not deployed as a staff control panel. PostgreSQL readers exist; no staff OIDC/ops hostname approval in last report.
- ERPNext exists as GET-only shadow reader, discrepancy reconciliation/queue, mappings/backoff/DLQ **but no running ERPNext host or scheduled integration** in last report. ERP writes remain refused; do not turn them on to make tests pass.
- Payment config is preview on shared staging. iPaymu adapter is sandbox-host restricted; official docs say redirect create returns `SessionID` and hosted URL; authoritative transaction lookup and callback behavior require provider-backed validation. One `CREATE_SESSION_PASS` probe is *not* a paid-order E2E pass.
- `docs/production/05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md` chooses **marketplace-owned production checkout** while this mission requests **direct iPaymu payments**. This is a required business/ADR decision: owner must sign a new or amended ADR clarifying whether launch is `MARKETPLACE_ONLY`, `DIRECT_CHECKOUT`, or `DUAL_CHANNEL`. If marketplace-only, do not force an unapproved PSP into production. The same decision changes payment, fulfillment, customer support, and launch acceptance paths.
- Google customer login previously passed manually; that evidence is historical. Rerun after staging deploy; staff OIDC/Cloudflare Access are separate identities.
- Nutrition/certification claims include pending/unapproved items. Check exact publication controls and obtain signed evidence per SKU/label before launch. Never fabricate BPOM, halal or lab signoff.

## PHASE 0 — RELEASE DECISION AND EVIDENCE RECONCILIATION

Gather *current* UTC timestamp and source: `git status`, `git rev-parse HEAD`, `git rev-parse origin/main`, latest PRs/checks, CI jobs, RC workflow, GHCR image digests or approved run summary, `/healthz`, `/readyz`, Cloudflare deployment version, DNS/TLS, canonical redirects, actual production hosting provider, active environment labels, DB migration table `0011–0013`, worker uptime, backup inventory, Cloudflare Access and OAuth status. SSH to `vps-contabo-yubie-1` read-only only if authorized and known host key verified; distinguish Ubuntu-VPS-Clone local machine from Contabo VPS. SSH failing inside agent is not proof host is down. Do not dump env; report secrets `SET/MISSING/UNVERIFIED` only.

Read the uploaded handoff transcript and preceding planning docs; reconcile historical evidence with live results. Publish `docs/production/readiness/QA_BASELINE_YYYYMMDD.md` and `QA_BLOCKER_REGISTER.md` with columns ID, component, observed error, severity P0/P1/P2/P3, owner `ENGINEERING/OPERATOR/PROVIDER/LEGAL`, environment, verified evidence URL/path, reproducibility, recommended fix, gate, current status (`PASS/FAIL/BLOCKED_EXTERNAL/NOT_RUN`). Status must reflect actual execution.

**P0 drift gate:** If staging image or migration differs from reviewed SHA, STOP external transactional tests. First perform controlled RC/backup/isolated restore/migration/rollout through existing staging release runbook, after scope approval. Migration 0013 may block writes while indexes build. Time locks, drain writes and preserve rollback strategy. Keep shared staging `COMMERCE_PROVIDER=preview`; use a separate isolated sandbox deployment for iPaymu.

## PHASE 1 — BUILD A REAL PLAYWRIGHT TEST ARCHITECTURE

Implement reproducible Playwright projects, with separate config/env per tier:

- `e2e/mock`: deterministic unit-browser fixtures, no external credentials, intercept only explicit endpoints and assert mock coverage. CI safe for PRs.
- `e2e/staging`: **real** `https://staging.yubiefood.com` with staging API/database, approved test accounts, synthetic data, authenticated Cloudflare Access. Fail tests if critical endpoints are unexpectedly mocked. Allow `BASE_URL` override and `API_BASE_URL`. Never silently fall back to localhost on remote failure.
- `e2e/sandbox`: isolated iPaymu sandbox-specific service + dedicated DB, no production merchant credentials. Use real provider only when protected sandbox credentials, written provider contract, preapproved test window and disposable order cleanup all exist.
- `e2e/production-smoke`: **read-only** unauthenticated + permitted customer-authenticated smoke for `yubiefood.com`: public navigation, assets, login render, TLS and SEO, canonical redirect, no 500s; no order mutation or provider contact. Post-approved limited live pilot is a distinct signed script, not part of normal smoke.

Browser matrix: Chromium desktop 1440x900, Chromium mobile Pixel 7 393x851, WebKit iPhone-sized view, Firefox desktop; include at least 320px width, tablet, 200% zoom, keyboard-only, touch interactions and reduced-motion scenario. Set deterministic locale `id-ID`, timezone `Asia/Jakarta`, proper browser permissions, stable clock where safe. Use `getByRole`/`getByLabel` locators and observable assertions, not arbitrary sleeps or `force:true` to bypass UI failures. Separate mutating tests into workers with unique accounts, carts, sessions, inventory fixtures and namespaced IDs; use 1 worker for shared-environment payment/ERP mutation tests. Use `forbidOnly`, CI retries limited to diagnosing flakes, global timeout, bounded timeouts, HTML + JUnit + JSON report, trace/screenshots/videos on failure and sanitized upload. Never count a flaky pass on retry as a clean production pass.

Auth: test (a) anonymous, (b) Google customer, (c) staff viewer, (d) operator, (e) finance, (f) forbidden customer→admin access. Save state to `playwright/.auth` excluded from git, with restricted permissions and no cloud uploads; rotate/discard on expiry. Allow an approved manual Google sign-in setup for legitimate test users rather than trying to bypass Google/Cloudflare CAPTCHA/MFA. Staff OIDC must validate issuer/audience/subject, independent of customer Google login.

Evidence artifacts: `artifacts/qa/<UTC timestamp>/<environment>/<test-id>/{screenshot,trace,network-redacted,console-redacted,report}.` Guard PII and secrets in logs/traces/recordings; private artifact retention and least privilege. Attach commit, digest, service URL, migration versions, correlation/request-id to each critical test. Mark `BLOCKED_ACCESS` when authentication or origin cannot be reached and never convert into PASS.

## PHASE 2 — FULL STORE FRONTEND / CUSTOMER QA MATRIX

All scenarios must include positive, negative, refresh, deep-link, mobile interaction, async loading/error state, and back/forward navigation, with meaningful assertions:

**WEB-01 Public and domain:** `yubiefood.com` and `www.yubiefood.com` HTTPS, canonical redirects, HSTS/CSP/cookie security, TLS validity, DNS, no leaked staging redirects, no false indexed staging, expected site metadata, `robots`, sitemap, open graph and share images, valid 404/500 behavior. Treat web-blocked inspection as `UNVERIFIED`, not site downtime.
**WEB-02 Landing and marketing:** video poster/media fallback, LCP hero, homepage sections, Our Story (education/documentation/team), Our Roots, recipes and root explorer, product comparison, B2B, FAQ, impact, hover/tap carousels, subnavigation anchor scroll not locking page, responsive menus, consent/discount popup, floating WhatsApp link, newsletter. Verify actual components that exist; missing requested features are recorded as P1/P2, never called passing.
**WEB-03 All products:** `/products`, `/shop`, `/products/yubie-flour`, `/products/yubie-shake`, `/products/yubie-ppang`, `/products/yubie-mie`. Check each SKU/variant, quantity, availability, image src HTTP 200/content-type/sizing/alt and real visual fit, badges, add-to-cart, price/discount/currency, variant switch, cart updates. Check nine prices from the source-of-truth list in baseline against approved owner list and DB. Validate lot stock vs UI and backend; do not infer availability from hard-coded `available: true` alone.
**WEB-04 Cart state:** empty cart, add/remove, adjust quantity, clamp max, mixed four-product cart, drawer open/close, keyboard and mobile touch, refresh persistence, multi-tab sync or explicit documented behavior, all totals correct, never permit negative/overflow quantity or client-specified price.
**WEB-05 Promotion and shipping:** `YUBIE15` eligibility/expiry/caps, invalid code, promo abuse, shipping policy and address rules, server calculates subtotal, promo, shipping and payable grand total; client cannot override amount. Owner approves whether `free_promotional` remains active. Test price changes after cart opens and at checkout.
**WEB-06 Guest and Google auth:** Cloudflare Access challenge (staging only), valid GIS sign-in, CSRF, Yubie HttpOnly session, logout, expired session, authenticated redirect, account page, `/account/orders`, order detail, unauthorized access returns 401/403 with no PII leakage. Guest `yubie_checkout` cookie survives retries; malformed/expired cookie safely replaced. No unsafe `next=` external redirects.
**WEB-07 Checkout UX:** invalid email/phone/address, missing field, error/success loading, idempotency key retention across 408/409/429/502/503/504 and network disconnect, prevent double click; never hide or fake a pending payment, clear recovery text, correct `returnUrl`/`cancelUrl`, UI shows verified pending/paid/expired/failed. In preview, no external payment host request, no real charging.
**WEB-08 Marketplace:** purchase options endpoint, verified marketplace/WhatsApp listings and outbound allowlist, empty list honest empty state, safe `noopener/noreferrer`, referral tracking without leaking PII. Marketplace order owner and return/refund policy must follow chosen ADR.
**WEB-09 Forms:** newsletter opt-in, B2B contact, waitlist, invalid payload/rate limits, CSRF, consent/withdrawal as implemented, provider down handling and duplicate form submission. No fabricated “email sent” if only DB save succeeded.
**WEB-10 Accessibility/UX:** keyboard tab/focus, accessible names, error summaries, skip-link, modals, focus trap/release, contrast and 200% zoom, WCAG 2.2 AA on critical paths, no horizontal overflow or dead taps, motion reduce, broken images, hydration exceptions, blank states, permanent loading spinner, localized Indonesian currency and text.
**WEB-11 Performance and SEO:** representative mobile throttling, actual Lighthouse/Web Vitals measurement; initial target p75 LCP <=2.5s, INP <=200ms, CLS <=0.1 on important production routes after measurement; if real-user data insufficient label LAB_ONLY. Define budgets for bundle/video size, lazy media, errors by route and resource. Don't invent results.

## PHASE 3 — PAYMENT CORRECTNESS (MUST PASS REAL DB + REAL SANDBOX)

Separate browser UI assertions, app/API contract tests, PostgreSQL transactional assertions, provider-backed iPaymu scenarios and finance reconciliation. Browser testing alone cannot prove double-charge safety.

**Financial invariants (hard P0):** for one normalized checkout intent, there is never more than one payable provider session; persisted order/intention/reservation linked atomically; customer amount = server-computed total = PSP amount; callbacks are authenticated and authoritative; each transition/stock consume/refund action is exactly once despite duplicates; unknown provider outcomes block creation of a second session and preserve reservation; late paid callbacks are escalated and reconciled, not discarded or silently marked failed; charge/refund/settlement discrepancies have operator queue and owner.

Required test cases PAY-01..PAY-20:
1. Same cart submit 2, 10 and 100 concurrent requests with same key and different keys, guest and authenticated, against **real PostgreSQL**; assert one durable intent/session and consistent stock.
2. Rapid click 2x/5x and slow spinner; button disabled but server-side dedupe is primary invariant.
3. Network disconnect **before send**, during PSP create, and **after PSP accepted before response**; reload/browser new tab; preserve/resume intent; no blind create retry.
4. Provider returns 408, 409, 429, 500, 502, 503, 504; unknown vs definitive failures mapped correctly; same attempt key kept as required.
5. Crash/restart at TX1 commit, external create, TX2 attach, webhook persistence, inventory transition and outbox delivery boundaries.
6. Invalid or absent idempotency key; changed cart/body with reused key; repeated request from new browser session; race on final stock unit.
7. Promo and shipping mathematical invariants: Rp35,000 Flour minus YUBIE15 => Rp29,750 if eligible and approved; provider payload exactly matches final server amount (no extra charge).
8. All nine variants, multiple lines, invalid prices, zero/negative, over maximum, overflow and currency mismatch.
9. Real iPaymu `POST /api/v2/payment` sandbox; verify exact-body signature, hosted redirect limited to official sandbox origin, durable SessionID mapping, request reference and total. No production PSP host in sandbox tests.
10. Real sandbox payment completion with approved test method; webhook arrives on reachable **isolated** callback URL and is persisted durably before acknowledgement.
11. Callback without signature, bad signature, wrong merchant, wrong amount, wrong currency, wrong checkout reference, wrong SessionID or transaction ID, wrong provider status; none can mark paid.
12. Callback replay, delayed, out-of-order, partial payload, alternate content type, JSON/form body canonicalization and timestamp discrepancy per **written iPaymu contract**, not guesses.
13. Verify authoritative transaction lookup against reference + amount + merchant; browser `returnUrl` cannot mark paid; pending page polls until verified.
14. Cancel/expire, unsupported SessionID cancel, unknown provider state, payment success after local expiry; never release active/ambiguous reserved stock without evidence.
15. Reconcile missed/late callbacks, orphan provider session, expired pending payment, duplicate payout, unknown transaction ID; build manual exception path if provider cannot resolve reference.
16. Authenticated session vs guest cookie binding, cross-user order tokens and account ownership; no customer PII in public checkout status.
17. High-value fraud boundaries, rate limits, replay/credential exposure, SSRF/open redirect, hosted checkout origin validation and input schema limits.
18. Refund requested twice, partial refund, provider timeout, refund cancellation/retry; if not implemented or PSP unsupported, mark `BLOCKED_EXTERNAL/P0` for direct-commerce production, never simulate success.
19. Finance settlement reconciliation: PSP transaction/fees, payouts, order status, refunds, GL postings and unmatched exceptions; explicit signoff.
20. Verify idempotency and customer outcome after worker restart and DB backup/restore; pending attempts not lost on rollback.

Use the repository's `docs/production/runbooks/ipaymu-sandbox-e2e.md` ten-step checklist as mandatory minimum, **not a replacement** for the matrix. A create-session probe may only return `CREATE_SESSION_PASS`. Obtain written iPaymu answers for SessionID cancel, reference lookup, duplicate `referenceId`, recovering `transactionId` after timeout, callback timestamp MAC, JSON vs form signature normalization; if unavailable keep sandbox gate blocked and live payment disabled. Do not perform forged-callback attacks against live PSP; use controlled local adapters/fixtures.

## PHASE 4 — ADMIN / REFINE / STAFF CONTROL PLANE

Determine whether a real Refine frontend exists. As of baseline, `apps/admin` is BFF only and `REFINE_COMPATIBILITY_PIN.installed=false`; thus Refine UI acceptance **cannot pass** without implementation. If owner selects full-platform production, implement and test: staff OIDC separate from customer Google; Cloudflare Access `ops-staging` restricted to named staff; server-side RBAC viewer/operator/finance; no cross-role read/write; short sessions, CSRF, audit trail, pagination and filtering; live read-only orders/payments, payment exception queue with retry/reconciliation controls requiring approval, stock lots, CRM/support ticket summary, admin search, trends/export with access controls, reversible safe action APIs. Initially keep dangerous writes disabled, including refunds, price changes, inventory adjustments, ERP stock writes. Never bind client-side Refine directly to Postgres or ERPNext credentials. Prove with Playwright using distinct operator identities, real test fixtures and row counts, plus BFF contract and negative RBAC/security tests.

## PHASE 5 — ERPNext OPERATIONAL ACCEPTANCE

Owner must approve isolated ERPNext host, staff access, license/cost and ERP schema. Never install ERPNext on shared RetroPick/Yubie VPS without resource approval. Once live test ERP exists, verify GET-only Frappe API user scoped to inventory; 1:1 Yubie variant-SKU→ERP Item and QA-released Warehouse mappings; batch and expiry, FEFO, quarantine/recalled lots, packaging units/UOM conversion, negative/fractional/missing quantities fail closed, stock discrepancies vs Yubie reservations, 1-way shadow reads, retry backoff and dead-letter alerts, operator triage, network outage and recover, data lag budget and audit. Use seed data with deliberately mismatched lots and prove mismatches surface. Verify procurement, BOM/manufacturing, receiving, QA, supplier, fulfillment and accounting flows only if deployed and in declared release scope; otherwise classify as not implemented, never PASS. ERP stock writes remain denied until an independently reviewed owner-approved single-writer design, migration and rollback exists. Prevent split-brain/double master. Run data-convergence acceptance across a simulated order→reservation→shipping/stock movement→finance scenario.

## PHASE 6 — SUPPORT, COMPLIANCE, AND OPERATIONAL QUALITY

Support: validate configured Zammad/WhatsApp Cloud API or alternative approved support implementation end-to-end: inbound approved test message, ticket dedupe/routing, bot/human escalation, food-safety priority, after-hours fallback, privacy redaction, human response, outbound messages, provider outage and replay, no false refund promises for marketplace orders. If credentials/provider absent mark BLOCKED_EXTERNAL.

Fulfillment: named owner, order packing, delivery address normalization, fulfillment state transitions, shipment tracking, cancellation, refund, returns and reconciliation with warehouse. **Do not claim fulfillment ready from checkout API alone.**

Product compliance: signed SKU evidence pack for ingredients, allergens, storage, expiry, label, applicable BPOM/SPP-IRT/halal status and claims. Compare public product page and comparison table against approved source. Do not publish unapproved health, disease-risk, slimming, “high fibre,” or certification claims. Require Indonesian privacy, T&C, refund/shipping policy review and contact channel. Legal/QA approval cannot be simulated by Playwright.

SRE and infrastructure: full-sha/image-digest parity, Cloudflare Worker ↔ Contabo API proxy, DNS/TLS/Access, runtime env contract, migrations `0011–0013`, monitoring for request correlation, pending-payment age, callback lag, failed reconciles and stock drift; actual alerts to an on-call channel, not just dashboard counters. PostgreSQL backup and **off-host** encrypted copy plus isolated restore, RPO/RTO drill, migrations with estimated locks, reversible deploy, application rollback preserving future schema, PSP downtime/drain, delayed callbacks after rollback, Cloudflare cache purge if needed, rate limits/CSP, secret rotation procedures and incident escalation.

Security: pin/review maintained tools, Gitleaks history, Semgrep payment rules, Trivy FS/image, SBOM and dependency review, OWASP ASVS L2/Top 10, auth BOLA/IDOR/CSRF/XSS/open redirect, session fixation, webhook replay/limits/signature, content security, external links, sensitive data leakage. Run automated passive/scoped DAST only on isolated staging; no production active scans without additional permission.

## PHASE 7 — FIX LOOP AND RELEASE GATE

Execute: (1) observe error; (2) reproduce via failing test; (3) identify root cause and commit evidence; (4) smallest secure fix; (5) tests all green; (6) security review; (7) push PR and verify CI; (8) merge approved PR; (9) produce immutable RC + digests after authorization; (10) backup and isolated restore; (11) stage upgrade/migration under change window; (12) real Playwright staging regression; (13) provider sandbox E2E if credentials/contract approved; (14) collect owner signoffs; (15) GO/NO-GO decision.

No blanket `test.skip`, mocked PSP marked as real, disabled validation, ignored flaky tests, arbitrary timeouts or fake screenshots. Stop on P0/P1 production-path bug; use clear actionable external blockers when permission/host/provider missing.

Mandatory gates (all evidence attached):
- **G0 Business model ADR:** production is Marketplace Only, Direct iPaymu, or Dual; signed owner decision reconciles docs.
- **G1 Source/CI:** main SHA reviewed, required jobs green, SBOM, no critical/high open release defect, code scanning and browser suite passed in correct tier.
- **G2 Supply chain/deploy:** trusted immutable image digests and Worker version; staging running intended SHA; database migrations applied; restore/off-host backup drill passed; no unrelated infra changes.
- **G3 Customer storefront:** full SKU/PDP/cart/login/account/SEO/UX mobile E2E with real staging API passes; user data correct; no serious accessibility defects.
- **G4 Financial:** concurrency invariants real PostgreSQL PASS, full isolated PSP sandbox acceptance with callback, settlement/refund and reconciliation PASS; no unresolved ambiguous sessions.
- **G5 Admin:** deployed Refine interface + staff identity/Access/RBAC/audit + real BFF readers, negative security tests PASS.
- **G6 ERP:** isolated ERPNext host live, mapping and 1-way shadow sync PASS, physical inventory authority verified, stock writes remain gated, operational workflows within scope signed.
- **G7 Support/fulfillment:** reachable real customer support, food safety routing, order fulfillment/cancel/returns owner, monitoring and on-call PASS.
- **G8 Compliance:** signed product/claims/legal/privacy/refund/shipping/merchant KYC and production credentials PASS.
- **G9 Release operations:** clean rollback/canary plan, RPO/RTO evidence, payment drain, real alert notification, finance reconciliation owner PASS.
- **G10 Human release authorization:** time-bounded approval references exact SHA/digests, target domain, deploy window, rollback owner, approvers and payment mode. Absence = NO-GO.

**Decision rules:** A blocked, skipped or historical-only test is not PASS. `GO_LIVE_FULL_PLATFORM` requires **G0–G10 all PASS**. If owner elects marketplace-only launch, create an independently scoped `GO_LIVE_MARKETPLACE_SITE` with modified written checklist and do **not** enable direct iPaymu; never quietly weaken full-platform gates. Report alternatives without claiming the requested full-stack launch passed.

## PHASE 8 — ONLY AFTER G0–G10 PASS AND RELEASE OWNER AUTHORIZATION

Perform reviewed controlled release: maintenance/change window, snapshot and off-host backup with restore proof, document running image digests, ready metrics, provider session drain/reconcile, deploy reviewed SHA/digests with progressive traffic/canary if supported, inspect live health, read-only prod Playwright smoke and authorized low-value pilot payment+refund with finance observer, monitor errors/PSP discrepancies and order/stock invariant. Roll back application only if safe for in-flight payments; never erase database or lose callbacks. Stop new orders and reconcile before making reversible changes. Promote traffic gradually only on explicitly defined stable windows with transaction-owner signoff. Make final GO receipt with release SHA, digests, timestamp, observed SLOs, order/payment/stock consistency, alerts and on-call/hypercare. If anything violates P0/P1, halt promotion and switch to the documented incident process.

## DELIVERABLES (REQUIRED FILES)

Create and maintain in `docs/production/readiness/`:
- `E2E_TEST_INVENTORY.md` — each tested user journey, assertion and environment.
- `PRODUCTION_BROWSER_AUDIT.md` — domain, UI, screenshot, console/network and accessibility findings; label inaccessible sites.
- `FINANCIAL_PAYMENT_ACCEPTANCE.md` — DB invariants and provider-backed tests, identifiers redacted, single/double charge evidence.
- `ADMIN_ERP_SUPPORT_ACCEPTANCE.md` — real admin/ERP/support, roles, data mappings and failures.
- `RELEASE_BLOCKER_REGISTER.md` — owner, severity, reproducible failures, fixes and resolution evidence.
- `RELEASE_GO_NO_GO.md` — G0–G10, signed owners, gate evidence, deployed version and exact next action.
- `RELEASE_RECEIPT.md` only after approved deployment; otherwise `PRODUCTION_NOT_RELEASED.md`.

Create versioned Playwright tests under `e2e/` and GitHub Actions workflows for mock-on-PR and staging/sandbox manual environment-gated execution. Attach private, sanitized JUnit/HTML/trace artifacts. Preserve the existing suite. Each test failure must be mapped to issue/PR and retested on the deployed reviewed artifact.

**Final response format:** verified Git main SHA, staging/prod SHA, exact browser coverage and pass/fail/blocked counts separated by MOCK, STAGING_REAL, PSP_SANDBOX_REAL, PROD_READ_ONLY; P0/P1 defects; iPaymu and refunds; admin/ERP/support readiness; migration/backup proof; owner action checklist; signed gate matrix and **GO or NO-GO**. Never say “all done” merely because source was merged.

**Start now:** check repo and live domains read-only, produce baseline/drift evidence, implement missing real Playwright projects with no external secrets, and execute all safe unblocked tests. Escalate only the precise credentials, approvals and infrastructure scopes truly required for E2E and release.
