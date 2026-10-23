# Yubie Production Finalization — Verified Engineering Goal Plan

**Planning date:** 2026-10-20 (Asia/Jakarta). **Repository:** https://github.com/yubiefood-id/yubie-platform. **Main SHA verified via GitHub:** `6a2f4516e77325cd786bde72e97eef48b9e786ed` (PR #9 merged). **CI:** https://github.com/yubiefood-id/yubie-platform/actions/runs/39312784211 — success. These are source/CI observations, not proof that this SHA is running on VPS. **Prior report:** `docs/development/execution/STAGING_HANDOFF.md` and `STAGING_E2E_ACCEPTANCE.md` date 2026-10-19, record earlier HEAD `7167636`, runtime API `aa00c53`, no staging migration 0011, no live iPaymu sandbox call, and unverified database restore. Their historical statements must not be rewritten as current runtime proof. **Payment mode last operator-reported:** preview. Verify again before mutation.

## Executive goal and release definition

Yubie operates an Indonesian D2C food storefront with reliable hosted payments, safe stock reservations, verified food/product content, usable fulfillment and customer service, private administrative control plane, independent production observability, secure restores, documented operation and rollback. **No customer loses money because the UI or network timed out:** the engineering objective is one recoverable checkout intent, no duplicate payable session under supported provider contract, no unauthorized paid state, documented duplicate-capture detection and verified refund response when provider behavior cannot guarantee perfect prevention.

Three distinct go-live layers: (A) **Commerce production**: storefront, orders, payment, refunds, stock reservations, actual fulfillment and support; (B) **Operations admin**: independent restricted Refine-based control plane with real BFF data and auditable actions; (C) **ERPNext rollout**: read-only/shadow first, then one-way governed synchronization of stock and finance. Do not block a *minimal* commerce launch waiting for unrelated ERP modules if human-operated stock controls and reconciliation are adequate and signed off; do not claim full-company platform complete until all user-requested workstreams pass.

## Verified source observations / risk hypotheses

1. `packages/persistence/migrations/0011_checkout_intent.sql`: unique partial index `(principal_key, request_hash)` only when `principal_key IS NOT NULL`, `status='pending'`, and selected reconciliation state. No equivalent durable guest-level uniqueness is evidenced by that index. Reported handoff explicitly identifies guest retry gap. Verify end-to-end rather than assume exploit.
2. `packages/application/src/use-cases/first-party-checkout.ts`: computes discounted `totals.grandTotalAmount`, sends full priced line items in the provider create request. `packages/integrations/src/ipaymu/ipaymu-payment-provider.ts`: asserts `sum(items) === amount`. This appears to reject discounted YUBIE15 checkouts; reproduce under unit tests and provider contract before changing monetary representation. Also review shipping, taxes, provider fees, rounding, zero/negative totals and maximum amounts.
3. iPaymu create uses `POST /api/v2/payment` returning `SessionID`; documented `POST /api/v2/transaction` lookup requires `transactionId`. Adapter fail-closes if lookup receives nonnumeric session identifier; no documented cancellation by SessionID. Source contract intentionally blocks payment activation pending provider-backed proof. Preserve these hard stops.
4. `apps/admin/src/server.ts` BFF currently returns empty arrays for orders/payments; `apps/admin/package.json` contains only TypeScript build scripts. Refine is **not** installed or a working dashboard. Admin session issuer needs enterprise-grade login, session revocation, role assignment and MFA/Access upstream, not merely an HMAC cookie.
5. `packages/integrations` includes an ERPNext shadow adapter, but no ERPNext deployment or authorized stock write. Avoid dual-master quantities. ERPNext is backed by Frappe (separate dedicated infrastructure); not PostgreSQL Yubie commerce DB.
6. iPaymu callback route in `apps/api/src/index.ts` validates signature and checks `trx_id` via provider before applying. Provider-authentic status, merchant, amount, currency, reference, and client trust must be verified by API + DB + live sandbox tests; mock tests alone are not provider certification.
7. Current `apps/web/components/checkout/checkout-view.tsx` still mentions Xendit to customers even if iPaymu is selected, and sets `mode='preview'` in some error branches; clean up trustworthy UX. `APP_ORIGIN`, webhook URL, release SHA, and production canonical hostname are **operator choices** not guesses.
8. Staging web patch to purchase-options route is merged, but historical handoff still calls it dirty; reconcile current Git SHA/runtime and clean docs. GitHub issue #7 remains open even though PR #9 landed. Track actual remaining acceptance in the issue; do not close on mocks.

## Target logical architecture

- Browser -> Cloudflare storefront (Vinext Worker) -> same-origin `/api/*` thin server-side proxy -> Yubie `apps/api` (VPS, TLS ingress) -> PostgreSQL internal network.
- Checkout: immutable server quote + durable checkout intent -> atomic order/payment intent/FEFO reservation/outbox -> selected provider via `PaymentProviderPort` -> hosted iPaymu payment -> signed callback -> durable inbox -> authoritative transaction check -> locked payment state transition -> consume or release inventory exactly once -> audit and notifications.
- `apps/worker`: reconciliation, retryable outbox delivery, stock discrepancy checks, reconciliation alarms, delayed callbacks; no guess-based expiry on ambiguous sessions. Disable unsafe automatic cancel/retry paths.
- `apps/admin` Refine UI behind Cloudflare Access + independent OIDC/session RBAC, same-origin BFF; calls only operator APIs, no raw DB or provider secret in browser. Operator reads inventory, orders, support, finance, failures; writes subject to approval, immutable audit and scoped permissions.
- ERPNext (isolated host): physical inventory, warehouses, supplier purchase, batch/expiry, QA release, manufacturing BoM/work orders, accounting; Yubie owns online cart/order/payment + active reservations. Materialized availability = released physical inventory from ERPNext - Yubie unresolved reservations - operational safety hold. Never let both systems independently alter the same authoritative quantity. Use idempotent event bridge with mapping, sequence/replay, DLQ, dedupe and reconciliation reports.
- Zammad + official Meta WhatsApp Cloud API: support cases, escalation, ticket ownership. Secrets, WhatsApp credentials and webhook endpoints isolated; do not expose to web or automatically assert food/health claims.

## Delivery milestones, sequence and evidence gates

### P0 — Re-baseline and preserve (M0)

- Read AGENTS.md, prior plan/acceptance/handoff, full source, branch state, CI, GHCR digests, deployed Worker version, live API image and DB migration list. `main=6a2f451` at planning time, but do not assume local branches caught up. Confirm Git repo + clean/dirty state before cherry-pick/rebase. Never overwrite user edits or untracked potential-secret files.
- Open new short-lived branch from reconciled latest main. Write an evidence ledger with UTC time, SHA, actual commands, PASS/FAIL/BLOCKED_EXTERNAL/NOT_RUN; screenshot evidence sanitized. Compare tested CI SHA with container image digest and deployment manifest. No deployment before restore drill or known backward-compat migration plan.
- Reconcile issue #7 against PR #9; preserve open external and real-DB acceptance gates.

### P1 — Payment correctness blocker (M1)

- Write reproducible failing tests for iPaymu promo YUBIE15, price/discount/shipping/fee reconciliation, guest multi-tab/new-key duplicates and authenticated race. Fix server-side durable identity of one cart/checkout *intent*, not a global anonymous lock. Ensure guest identity uses a secure session/scoped capability and stable request hash; no cross-guest collisions or cross-user exposure.
- Implement explicit `CheckoutIntent` state machine (`CREATING`, `PENDING_PROVIDER`, `AWAITING_PAYMENT`, `PAID`, `FAILED`, `EXPIRED`, `UNKNOWN_RECONCILIATION`, `REFUNDED`) and provider reference mapping with database constraints. At most one unresolved payable session per logical intent, not simply one user/cart forever; permit a new purchase only after definitive resolution or operator-approved override. No store of raw PII in idempotency key.
- `Idempotency-Key` reused across network timeouts, 408/409/429/5xx, process crash, browser refresh, auth/guest restarts. Distinguish known rejected 4xx from an ambiguous response; no silent new key. Add safe checkout status/recovery endpoint for authenticated user or opaque possession token (rate-limited, redacted) and explicit pending UX.
- Enforce integer IDR math, canonical server-only price/discount/tax/shipping, documented provider line-item representation for discounts and shipping, fee payer, exact expected amounts and payment caps. Test YUBIE15, price changed after cart, partial inventory, invalid quantities, zero/negative totals.
- Webhook trust: HMAC exact documented normalization, timestamp/replay policy supported by provider, body size, type/encoding, merchant/reference/transactionId/amount/currency; duplicate and reordering; durable inbox before 2xx; provider-authoritative status required. Check row-level locks and event uniqueness with PostgreSQL transactions. An attacker controlling URL/status/headers must never create paid state.
- Pending/unknown state never auto-releases stock, never creates another payable session. If provider contract cannot guarantee unique creation/cancel/discovery, hold and escalate; investigate alternative Xendit vs provider choice rather than weakening invariant.
- Real refunds and overpayment handling: decide supported operations; no manual status=PAID; finance-review credit/refund workflow with audit and dual approval for money movement.

### P2 — Provider contract & sandbox integration (M2)

- Owner must ROTATE the iPaymu VA/key previously exposed in chat; never use exposed values. New confirmed *sandbox* secret pair through approved secret manager only. Do not copy to Git/PR/terminal output or frontend; run service-scoped config validation and secret scan.
- Obtain written support response for SessionID -> transactionId discovery, reference lookup/idempotency, duplicate reference creation, cancel/expiration and callback replay semantics. Archive reference/date in docs; unsupported operations must fail closed. A bounded history search is not transactional uniqueness evidence.
- Tests with **real sandbox**: create → hosted redirect → paid callback/status; callback-first, browser-return-first, delay, duplicate callbacks, replay, forged signature, tampered amount/reference, failure/expiry/refund, late paid, provider 408/429/500/timeout, DB failure after provider create, service crash, reconcile after restart, multi-tab guest double-submit, promo YUBIE15, two distinct items/sizes, exact stock amount, order history, provider settlement snapshot.
- `IPAYMU_ENV=sandbox`, `COMMERCE_PROVIDER=preview` until explicit staged payment test authorization; sandbox switch only after credentials + safety gates. No *live-money* test until merchant and go-live signoff. Maintain Xendit safe fallback code, not automatic provider-switch mid-attempt.

### P3 — Release candidate and staging infrastructure (M3)

- Confirm `npm ci`, `npm run check`, full test with real disposable PostgreSQL (no skips), build, typecheck, container builds, malware/dependency/security scan. Pin images by full source SHA AND image digest. Build release-candidate artifact of new code using existing GitHub Actions (not merely green CI), verify digest exists and matches same source SHA.
- Staging preflight: unique DNS/Worker namespaces; check Cloudflare Access actual policy, authorized accounts, WAF budgets, authentication, no workers.dev preview, TLS headers; server-side CORS/cookie settings; no production/RetroPick changes.
- Snapshot staging DB; restore to disposable *isolated* DB and verify integrity/counts/checksums; execute migration 0011 in disposable DB, smoke old/new app compatibility, constraints, rollback/restore drill. Apply additive migration to staging only as a documented, approved release action. Prefer expand → deploy → validate → contract, not irreversible down-migration. Monitor locks, migration duration.
- Only then deploy matching API + worker image and validated web artifact to staging; hold `COMMERCE_PROVIDER=preview`; smoke auth/cart/catalog/order preview, request tracing and metrics. Then explicitly flip staged iPaymu sandbox under release controls, test, return preview on failure (do not discard in-flight sessions or webhook handling). Preserve previous rollback image and data.

### P4 — Private Refine admin (M4)

- `apps/admin` is BFF skeleton, not UI. Install compatible pinned Refine packages after peer-dependency/build/security check; build real dashboard with `dataProvider`, `authProvider`, `accessControlProvider`; never trust client-side RBAC as authorization.
- Separate signed staff identity: enterprise/OIDC Google with allowlisted accounts + MFA/Cloudflare Access, server-verified issuer/audience and staff role directory, expiring/revocable sessions; CSRF, rate limits, secure cookies; deny-by-default route and row-level authorization. No ability for a customer session to become staff. Structured audit (who/what/when/before/after/correlation ID).
- Views: overview + alerts; orders and fulfillment; payment status and reconciliation queue; inventory SKU/lot/expiry/QA holds; product/catalog/price/promotions and approvals; customer/support (minimum necessary PII); suppliers/B2B; ERP sync queue; audit log/roles, backups and operational health. Mutation approvals for refunds, price changes, stock release, permissions and credit notes. User-friendly local IDR/Asia-Jakarta presentation.
- Real paginated, filtered BFF endpoints; no placeholder empty arrays, no ERP tokens/client secret in JS. Deploy private `ops-staging` hostname only after Access policy and DNS sign-off. Unit + integration + browser E2E + permission-matrix and IDOR test.

### P5 — ERPNext isolated pilot (M5)

- Do not install ERPNext into shared Contabo running Yubie + RetroPick without capacity/cost/backup/ownership sign-off. Frappe runtime requires its own supported DB and services; isolate network and service credentials. Pilot a dedicated instance.
- Map ERPNext Item to four product families and nine variants, units, batch numbers, expiry, physical on-hand and quality release, raw material receipts, vendor, warehouse, production BoM/work orders, batch recall trace, returns. Stock + accounting authority and VAT/tax rules require finance signoff.
- Shadow-read side-by-side with Yubie quantities; discrepancy reporting; replay/idempotency/DLQ. Choose one writable owner for physical stock: ERPNext; Yubie owns reservations and checkout. Gate propagation on fresh authorized batches/QA. Implement guarded one-way authority after reconciliation and operator approval; no unsafe bidirectional master writes.
- Inventory acceptance: two simultaneous sales for last item, expiry crossing, QA quarantine, recalled lot, damaged return, partially shipped order, stock adjustment, ERP outage, delayed messages, backfill/replay, rollback, batch-to-order recall trace.

### P6 — Whole storefront / operations / compliance (M6)

- Audit all 4 products, nine SKU variants, mobile/cart/Google/guest login, thumbnails and 4K product imagery, exact brand specs, accessibility (keyboard, tap, contrast), loading and slow network, success/cancel/refund pages, checkout without login, account ownership isolation.
- Complete shipping fee policy, address validation, shipping coverage, delivery SLAs, warehouse picking, packing, tracking, cancellation, refunds, returns, out-of-stock, fraud holds and customer communications. Existing `SHIPPING_POLICY=free_promotional` must be explicitly approved or replaced with costed policy and tested; do not silently assume universal free shipping.
- Nutrition/product-copy source approval, BPOM/PIRT/halal claims only if verified for exact SKU; allergen/expiry/storage/label safety; terms/privacy/refund/shipping contact pages; merchant KYC, production static IP/domain onboarding required by iPaymu docs. Legal review for Indonesian privacy and commerce compliance, no invented certifications.
- Zammad + Meta WhatsApp Cloud API: provision service credential + routing IDs, signed webhook and takeover; verify actual staging conversations. Gracefully degrade to manual contact path if explicitly approved, without pretending bot integration passes.
- SEO/analytics consent, privacy-preserving conversion events and performance Core Web Vitals, domain/TLS, email SPF/DKIM/DMARC/transactional notifications, backups and on-call escalation.

### P7 — Production release controls (M7)

- Decide and document canonical production domain (not guessed), production DNS/CF/Google OAuth origin, static IP whitelist, separate API/database/worker/ERP/admin environments and credentials, production secrets rotated, TLS/hardening/network restrictions; no shared staging credentials.
- Real merchant activation and approved legal/finance/tax/food labeling, accepted product claims; merchant production key only after all sandbox proofs. Design change to lift `IPAYMU_ENV=sandbox` hard stop as **separate reviewed ADR + audited code + new tests** — never remove it silently or point sandbox URLs to live credentials.
- Approved release candidate digest, branch protection, minimum reviewers including finance/operator for money path, release runbook and backup restore evidence. Deploy to a protected canary/limited traffic cohort when supported, inspect payment/failed webhook/reconcile metrics before expansion. Have an operator-owned kill switch and an *in-flight payment drain* policy: switching new checkouts to preview must not disable callbacks or reconciliation for old iPaymu orders.
- Production accept only when security, E2E, finance settlement, refunds, inventory, observability, support, DNS, content/regulatory, backups and rollback are PASS. Any BLOCKED_EXTERNAL/NOT_RUN financial P0 = NO-GO.

### P8 — Hypercare / continuous quality (M8)

- Monitor first paid attempts with operator approval, track order-paid mismatches, unhandled callback, unknown payment state, over/under capture, duplicated settlement, negative stock, reconciliation lag, error budget, latency and page conversion; alert on any financial mismatch. Daily settlement and stock reconciliation, signed finance signoff; test restore and runbooks on scheduled cadence.
- Near-term proposed SLOs (not claims): storefront p95 server response < 1s for API under agreed load, checkout create availability >= 99.9% excluding provider, critical financial discrepancy count = 0, webhook reconciliation lag < 5 minutes for healthy provider, alerts for any unresolved >15m, RPO <= 15m / RTO <= 2h after measured drills. Replace with measured SLIs and business-approved objectives.

## Security gates / threat coverage

- CI: `npm ci`, lint, TypeScript, unit + integration/Postgres/migration + Playwright browser, checkout invariants, Semgrep payment rules, dependency audit, CodeQL if enabled, Gitleaks, Trivy SBOM/image, license/hook review for selected security skills, ZAP passive/limited authorized staging only. Pin scanners/actions/images; code review and secret exclusion, no broad unreviewed skill execution.
- Tests: duplicate requests, replay, forged HMAC, provider callback canonicalization, request tampering, price/discount drift, checkout CSRF, session fixation, Google OAuth issuer/aud/nonce/CSRF, admin IDOR/privilege escalation, inventory race + stock FEFO, CSP/headers/redirect allowlist, SSRF, DoS, dependency pin, leaked env, external URL injection, PII in logs/analytics.
- Never assert 'no vulnerabilities': document tested scope, residual risk, findings with file:line, reproduction and owner. Test only domains and systems under Yubie authorization.

## Owner / approval split

Engineering can implement code, tests, docs and isolated mocks; operator must supply new sandbox keys, obtain provider contract clarification, approve live switching, configure Cloudflare/DNS, auth/OIDC, business policies, shipping, merchant account KYC, dedicated ERP resources and security tooling installs. CEO/finance must approve prices, refunds, fee policy, settlement and go-live. Food QA approves product claims/batch release. Support owner verifies Zammad/WhatsApp. Never invent approvals.

## Definition of done: objective evidence

A release is complete only with git SHA, image digest, successful CI + integration test IDs, cloud Worker version, running container release ID, DB migration checksum, isolated backup restore receipt, provider-backed sandbox matrix evidence, admin role security checks, ERP shadow discrepancy report, complete product content review, merchant approval, controlled production payment proof and reconciled settlement, monitoring dashboards/alarms, rollback exercise and signed owners. Status vocabulary: PASS / FAIL / BLOCKED_EXTERNAL / NOT_RUN / DEFERRED_APPROVED (with owner and dated rationale).

## Official references (verify if docs have changed)

- https://docs.ipaymu.com/id/docs/payment/redirect-payment
- https://docs.ipaymu.com/id/docs/callback
- https://docs.ipaymu.com/id/docs/transaction/check-transaction
- https://docs.ipaymu.com/id/docs/verification
- https://refine.dev/core/docs/data/
- https://refine.dev/core/docs/authorization/access-control-provider/
- https://docs.frappe.io/framework/user/en/api/rest
- https://docs.frappe.io/erpnext/batch
- https://docs.frappe.io/erpnext/stock-reconciliation
