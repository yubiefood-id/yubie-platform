# Full-commerce continuation checkpoint — 24 October 2026

## Binding scope correction

The release deliverable is FULL COMMERCE, not catalog-only. Do not restart planning,
replace it with a catalog-only launch, or promote a catalog artifact as completion.
The user explicitly requires Google customer authentication/accounts; catalog and
inventory availability; cart, multi-product checkout, addresses and orders;
Xendit production payments preferred (iPaymu only if explicitly approved), real
provider acceptance and Finance authorization; ERPNext production with inventory
reconciliation/workflows; protected admin, fulfillment and finance operations.

Deferred ONLY: Meta WhatsApp Cloud API, Yubi V2 WhatsApp bot, WhatsApp automation/
marketing, and nonessential AI automation. Preserve their existing source/flags.

No named release owner or on-call is confirmed. No Finance LIVE sign-off or
accepted rollback plan exists in this session. Preserve the current public website,
DNS and disabled live payments. Continue independently executable engineering,
isolated staging, security/integration and authorized real provider SANDBOX work.
Never invent credentials, provider receipts, identities or approval windows.

## Exact source/workspace state

- Implementation worktree: `/home/ubuntu/project/yubie-commerce-v3`.
- Last engineering HEAD: `4349a64f5784e3c64702e6338fb489e144142cd2`, pushed to
  `feat/commerce-v3-d-checkout`; clean before writing this checkpoint.
- This checkpoint is on `docs/full-commerce-handoff`, based on that HEAD. Resolve
  its own committed revision with `git rev-parse HEAD`; preserve it on resume.
- Original dirty main worktree: `/home/ubuntu/project/yubie-platform`, local HEAD
  `cd629593cc712ee76193d5f7554ace351960c3b1`; website CSS/layout/header/footer/hero,
  site config, favicon and four product-media changes plus untracked local work
  remain untouched. Do not reset, clean or silently merge this unrelated work.
- ERP worktree: `/home/ubuntu/project/yubie-erp-native`, branch
  `test/erp-native-acceptance`, HEAD `3ba058a`, clean at checkpoint inspection.
  Local ERP stack was stopped with volumes preserved; do not recreate/reset DBs.
- Other Yubi worktrees remain untouched. Inspect `git worktree list` on resume.
- Remote main was still cd62959 at last fetch; merge authorization was given,
  but no protected merge had executed when this checkpoint was first written.

## Completed engineering and evidence

- PR29 identity: head `0e3efbbe4a9f90c6562ae387292d4747479dff7f`, five CI gates PASS
  in run39970968906. Durable phone/Google identity, encrypted expiring OTP,
  abuse controls, safe linking, HttpOnly sessions and guarded SMSGate worker.
- PR30 addresses: head `6aabd810ce87a70c9225fd4df53696ca939676b8`, five gates PASS
  in run39995880748. Owner-scoped address CRUD/defaults, shared editor, Google
  previews, manual fallback, signed confirmed-pin receipts and 30-day pin cleanup.
- PR31 promotions: head `a1316b3302082ae6545178b36332d6733d56f7ea`, five gates PASS
  in run40004479478. Draft/unapproved campaign seed, verified entitlements,
  server pricing, atomic reservation/consume/release, refund retention and no
  public code-only eligibility. Provider/callback/recovery races fixed.
- D foundation `498e879`: nullable internal email/contact, migration0020, explicit
  V3 request/hash helpers preserving V1 hashes, historical idempotent recovery.
- D recovery `4349a64`: migration0021 hashed guest/account recovery bindings,
  principal-wide transaction locks and one unresolved attempt across changed
  carts. Proved binding + audit/outbox commit before business rejection;
  financial order/payment/reservation/audit/outbox still commit together.
  No historical order ownership is inferred from delivery phone/email or rewritten.
- Separate specification/security reviews cleared all slices after red/green
  regressions, including checkout rejection losing proof and withdrawn-SKU login
  recovery. Known reviewed blockers fixed; unfinished scope remains unfinished.
- Latest local `npm run check`: PASS, log `/tmp/v3-d-scope-final-check.log`.
- Full REAL disposable PostgreSQL: persistence73/API52 PASS, zero DB skips,
  log `/tmp/v3-d-scope-acceptance-pg.log`.
- Focused checkout10 + promotions14 PostgreSQL tests PASS. Sixteen concurrent
  changed carts create one provider session; cross-owner binding denied; audit
  failure rolls back; multiple historical pending attempts select no winner.
- Repository Semgrep: zero findings (`/tmp/v3-d-scope-semgrep.log`); history
  Gitleaks at4349a64: zero findings (`/tmp/v3-main-merge-gitleaks.log`).
- A/B focused browser and provider fixtures are MOCKED provider evidence only.
  No real OTP, Maps, PSP or production financial acceptance has been claimed.
- `/tmp` logs may vanish on restart. Source/tests/CI/this committed checkpoint
  and Beads are durable; do not depend on /tmp as the only source copy.

## Merge/CI state

User authorized push and merge through protection. Consolidated PR32:
https://github.com/yubiefood-id/yubie-platform/pull/32
head4349a64, base main, includes PR29/30/31 and both D slices.
CI40009446977: quality, persistence, security and containers PASS; browser was
RUNNING at last check. No bypass: main requires all five, up-to-date branch,
resolved conversations; administrators are enforced. Required review count0.
Repo auto-merge is disabled. PR32 is OPEN/BLOCKED until browser passes.
PR29–31 remain draft stacked PRs, preserved as review history. When PR32 merges,
verify included HEAD ancestry before closing any still-open superseded PRs.
Do not modify PR32's head merely to add this handoff and restart its CI.

## Deployment/rollback evidence (read-only observations)

- Vercel project verified via plugin and CLI: `yubie-web`,
  project `prj_b4TWyOWR6HGISvLi09lAaw4tasqr`,
  team `team_wDDjfSztM78LKthTsosnF3qw` (Asyam's projects).
- Latest project deployment was PREVIEW `dpl_7ZSYf7ifJXpdnQBerN7BLTFjduW1`,
  URL https://yubie-6jiz1uhui-asyams-projects.vercel.app,
  SHA `91f3b61e8856e4f43737fa8be12ea42114525378`; not a production receipt.
- Most recent production listing: READY `dpl_9GSJiRbcwEgMmMJutiNRv4YuNcQs`,
  URL https://yubie-i0j3oj3wl-asyams-projects.vercel.app,
  SHA `fabb8c2b0b7a495867372b89d60a2af547de69cd`, flagged rollback candidate
  by Vercel. That flag is NOT accepted last-known-good financial/product evidence.
- Public apex /release-manifest.json returned404; all four /products/yubie-* pages
  returned200. These observations do not verify current release identity or safety.
- No new deployment, promotion, DNS change, remote migration, provider send or
  live payment activation was performed. Git auto deployment remains disabled.
- VERIFIED LAST-KNOWN-GOOD / ACCEPTED ROLLBACK: NOT ESTABLISHED. Inspect actual
  production aliases, exact source, prior CI/operator receipts and financial
  compatibility. Do not treat the preview or the above old production as safe
  merely because it is READY or flagged as a rollback candidate.

## Readiness by mandatory subsystem

| Subsystem | Evidence / remaining gate |
| --- | --- |
| Google customer auth/accounts | Existing backend/session + linking compatibility tested; real Google handshake/account UI/operator acceptance still required. Phone/OTP/claim/linking UI remains unfinished. |
| Catalog/inventory | Four families/nine variants are approved source. Lot reservations/FEFO/food-safety constraints tested locally. Production stock/specifications, ERP authority and real reconciliation are not accepted. |
| Cart/checkout/addresses/orders | Legacy commerce and owned address book exist; D contact/recovery foundation tested. Public V3 HTTP adapter, authoritative quote endpoint and three-step phone-first checkout/saved-address/Maps integration remain unimplemented. Handle renewed pin receipt outside durable financial hashes/snapshots. Finish logout/guest re-entry without abandoning a pending attempt. |
| Payments | Xendit TEST and iPaymu sandbox adapters exist. Preferred production provider is Xendit; iPaymu needs explicit approval. No real provider matrix or Finance LIVE authorization. Hosted phone-only completion with omitted email must be verified; a synthetic request-shape test is not provider acceptance. Browser redirect never proves paid. |
| Promotions | Ownership and financial lifecycle implemented. Seed campaign remains DRAFT/unapproved. Claim UI, full checkout integration, approved scope/dates/shipping/refund commercial policy and real payment lifecycle acceptance required. |
| ERPNext | Beads yubie-fnf.11: production NOT_PROVISIONED / NOT_ERP_OPERATOR_READY. Local ERP16.51.1/Frappe16.52 synthetic native workflows, least-privilege readers/reconciliation and isolated restore were validated (PR22); no real operator UAT. See infrastructure/erpnext/LOCAL_ACCEPTANCE.md. |
| Admin/fulfillment/finance | Protected read-only dashboard and role/audit foundations exist in source. Real named viewer/operator/finance accounts, separate staff OAuth/Access/MFA, production fulfillment/finance workflows and operational acceptance remain required. Do not equate read-only pages with complete finance operations. |
| Operations/release | Full-production GO is blocked: no confirmed release owner/on-call, Finance authorization, real staging/UAT, accepted rollback, off-host backup/restore/monitoring/incident acceptance or exact approved production artifact. |
| WhatsApp/AI | Explicitly deferred. Do not spend the next session on Meta channel, Yubi live acceptance, WhatsApp marketing or nonessential AI. Preserve existing flags and emergency-off. |

## Operator actions, excluding WhatsApp

Use OPERATOR_ACTIONS.md for exact implemented variable names; do not invent values.
Provision isolated web/API/worker/PostgreSQL and protected APP_ORIGIN/API_PROXY_TOKEN;
verify actual schema and back up/restore before migrations0017–0021. Configure
private SMSGate/OTP/Turnstile and approved test identities/countries; restricted
Google Maps keys/Map ID/billing and real Google OAuth origins/audiences. These are
protected configuration/acceptance gates, not source failures.

Provide PSP sandbox credentials and contract/approved test identities; perform
real success, failure, expiry, duplicate/out-of-order callback, ambiguous-create,
reconciliation and phone-only checkout tests, then obtain Finance authorization
before any LIVE credential/provider activation. Keep production PUBLIC_CATALOG_NO_SALES
and payments disabled until the independently approved full-commerce cutover.

Approve isolated ERPNext production infrastructure, SKU/UOM/BOM/specification,
quarantine/release and stock authority/reservation design, Finance chart/tax and
real named manufacturing/warehouse/fulfillment/finance users. Accept off-host
backup/isolated restore, alerting, access audits, retention/privacy and support
operations. Confirm the monitored contact mailbox and legal/product/media copy.
Confirm named release owner/on-call, precise deployment window, exact artifact
and verified compatible rollback. None may be fabricated or presumed.

## Exact next executable commands

Run from the persistent implementation worktree; do not reset any checkout/DB:

```sh
cd /home/ubuntu/project/yubie-commerce-v3
# Memory Autopilot first, with this actual full-commerce task; follow AGENTS.md.
git status --short
git branch --show-current
git worktree list
git fetch origin
bd show yubie-8xs.8
bd show yubie-8xs.5
bd show yubie-fnf.11
gh run view 40009446977 --json status,conclusion,jobs
gh pr view 32 --json state,headRefOid,mergeStateStatus,mergeCommit
```

If and only if all five exact-head gates are success and PR32 remains at4349a64:

```sh
gh pr merge 32 --merge --match-head-commit 4349a64f5784e3c64702e6338fb489e144142cd2
git fetch origin
git rev-parse origin/main
gh run list --branch main --workflow CI --limit 3 --json databaseId,headSha,status,conclusion
```

Preserve this checkpoint branch, submit its documentation correction separately,
and resume D implementation in an isolated feature worktree/branch based on the
actual new main. Do not rebase/reset original dirty main. Follow existing tests
before implementation and independent reviews. CI passing is not live acceptance.

Local test database (SYNTHETIC ONLY), Docker `yubie-commerce-v3-pg`, PostgreSQL17:
`postgresql://commerce_v3:synthetic_v3_only@127.0.0.1:44620/commerce_v3`.
Do not substitute a staging/production database. Reproduce gates with:

```sh
npm ci
npm run check
# Set DATABASE_URL to the disposable synthetic URL above only.
npm run db:migrate
npm run db:seed
npm run test --workspace @yubie/persistence
npm run db:migrate
npm run test --workspace @yubie/api
```

Legacy fixtures deliberately downgrade their disposable schema, hence the second
migration before API tests. Inspect the existing ERP harness before executing
its bounded local commands; reuse preserved volumes and protected synthetic
configuration, and do not reset/recreate an existing ERP database.

## Complete engineering file manifest

The following is the exact name/status diff from cd62959 to4349a64. This checkpoint's
own documentation correction is additional. Review implementation from source,
not stale memory; individual milestone PRs provide prior review boundaries.

```text
M	.gitleaksignore
M	apps/api/src/composition/create-app.ts
A	apps/api/src/customer-addresses.ts
A	apps/api/src/customer-http.ts
A	apps/api/src/customer-identity.ts
A	apps/api/src/customer-locations.ts
A	apps/api/src/customer-promotions.ts
A	apps/api/src/customer-security.ts
M	apps/api/src/index.ts
A	apps/api/tests/address-api.test.mjs
M	apps/api/tests/api-commerce.test.mjs
A	apps/api/tests/customer-pin-token.test.mjs
A	apps/api/tests/customer-storage.test.mjs
A	apps/api/tests/phone-api.test.mjs
A	apps/api/tests/promotion-api.test.mjs
A	apps/web/app/api/account/addresses/[id]/route.ts
A	apps/web/app/api/account/addresses/route.ts
A	apps/web/app/api/account/default-address/route.ts
A	apps/web/app/api/account/identities/google/route.ts
A	apps/web/app/api/auth/phone/challenges/[id]/[action]/route.ts
A	apps/web/app/api/auth/phone/challenges/[id]/route.ts
A	apps/web/app/api/auth/phone/challenges/route.ts
A	apps/web/app/api/locations/[action]/route.ts
A	apps/web/app/api/promotions/welcome/claim/route.ts
A	apps/web/app/api/promotions/welcome/route.ts
M	apps/web/app/globals.css
M	apps/web/components/auth/account-view.tsx
M	apps/web/components/cart/cart-view.tsx
M	apps/web/components/checkout/checkout-view.tsx
M	apps/web/components/commerce/storefront-widgets.tsx
A	apps/web/components/delivery/address-book.tsx
A	apps/web/components/delivery/address-editor.tsx
A	apps/web/components/delivery/delivery-map.tsx
A	apps/web/components/delivery/location-picker.tsx
M	apps/web/config/site.ts
M	apps/web/features/cart/cart-context.tsx
A	apps/web/lib/api-proxy-body.ts
M	apps/web/lib/api-proxy.ts
A	apps/web/lib/customer-api.ts
M	apps/web/lib/proxy-headers.ts
M	apps/web/package.json
M	apps/web/tests/proxy-attempt.test.mjs
A	apps/web/tests/proxy-body.test.mjs
M	apps/worker/src/index.ts
A	apps/worker/src/phone-delivery-handler.ts
A	apps/worker/tests/phone-delivery.test.mjs
A	docs/production/commerce-v3/API_CONTRACTS.md
A	docs/production/commerce-v3/ARCHITECTURE.md
A	docs/production/commerce-v3/CURRENT_STATE.md
A	docs/production/commerce-v3/DATABASE_MIGRATION_PLAN.md
A	docs/production/commerce-v3/GOALS.md
A	docs/production/commerce-v3/IMPLEMENTATION_PLAN.md
A	docs/production/commerce-v3/OPERATOR_ACTIONS.md
A	docs/production/commerce-v3/PROMOTION_POLICY.md
A	docs/production/commerce-v3/RELEASE_GO_NO_GO.md
A	docs/production/commerce-v3/RISK_REGISTER.md
A	docs/production/commerce-v3/SECURITY_AND_PRIVACY.md
A	docs/production/commerce-v3/TEST_MATRIX.md
M	docs/production/yubi-v2/CONVERSATION_COPY_ID.md
M	docs/production/yubi-v2/DETERMINISTIC_FLOW_V2.md
M	e2e/commerce.spec.ts
A	e2e/mock/address-book.spec.ts
M	e2e/mock/forms.spec.ts
A	e2e/mock/verified-promotion.spec.ts
M	e2e/support/fixtures.ts
M	package-lock.json
A	packages/application/src/auth/otp-cryptography.ts
A	packages/application/src/auth/unavailable-storage.ts
M	packages/application/src/index.ts
M	packages/application/src/memory/in-memory-commerce-repos.ts
M	packages/application/src/memory/in-memory-tx.ts
M	packages/application/src/ports.ts
A	packages/application/src/ports/customer-address.ts
A	packages/application/src/ports/customer-identity.ts
A	packages/application/src/ports/delivery-location.ts
A	packages/application/src/ports/promotions.ts
M	packages/application/src/use-cases/auth.ts
M	packages/application/src/use-cases/checkout-intent.ts
A	packages/application/src/use-cases/checkout-principals.ts
A	packages/application/src/use-cases/customer-address.ts
A	packages/application/src/use-cases/delivery-location.ts
M	packages/application/src/use-cases/first-party-checkout.ts
A	packages/application/src/use-cases/phone-auth.ts
M	packages/application/src/use-cases/process-payment-webhook.ts
M	packages/application/src/use-cases/reconcile-payments.ts
A	packages/application/src/use-cases/verified-promotions.ts
A	packages/application/tests/auth-storage.test.mjs
M	packages/application/tests/checkout-amounts.test.mjs
M	packages/application/tests/commerce.test.mjs
M	packages/application/tests/guest-intent.test.mjs
A	packages/application/tests/otp-cryptography.test.mjs
M	packages/application/tests/reconcile-payments.test.mjs
M	packages/assistant/src/deterministic/v2.ts
M	packages/assistant/tests/deterministic/v2.test.mjs
A	packages/config/src/delivery-maps.ts
A	packages/config/src/identity-runtime.ts
M	packages/config/src/index.ts
M	packages/config/src/launch.ts
A	packages/config/tests/identity-config.test.mjs
A	packages/config/tests/maps-config.test.mjs
M	packages/domain/package.json
A	packages/domain/src/delivery-address.ts
M	packages/domain/src/identity.ts
M	packages/domain/src/index.ts
M	packages/domain/src/orders.ts
A	packages/domain/src/phone-identity.ts
A	packages/domain/src/phone.ts
M	packages/domain/src/promotions.ts
A	packages/domain/tests/delivery-address.test.mjs
M	packages/domain/tests/domain.test.mjs
A	packages/domain/tests/phone.test.mjs
A	packages/domain/tests/verified-promotion.test.mjs
M	packages/integrations/package.json
A	packages/integrations/src/google-maps/browser.ts
A	packages/integrations/src/google-maps/delivery-location.ts
M	packages/integrations/src/index.ts
M	packages/integrations/src/ipaymu/ipaymu-payment-provider.ts
A	packages/integrations/src/smsgate/otp-delivery.ts
A	packages/integrations/src/smsgate/turnstile.ts
A	packages/integrations/tests/delivery-map-browser.test.mjs
A	packages/integrations/tests/google-delivery-location.test.mjs
M	packages/integrations/tests/ipaymu.test.mjs
A	packages/integrations/tests/smsgate-otp.test.mjs
A	packages/integrations/tests/turnstile.test.mjs
A	packages/persistence/migrations/0017_phone_identity.sql
A	packages/persistence/migrations/0018_customer_addresses.sql
A	packages/persistence/migrations/0019_verified_promotions.sql
A	packages/persistence/migrations/0020_phone_first_order_contact.sql
A	packages/persistence/migrations/0021_checkout_guest_bindings.sql
M	packages/persistence/src/index.ts
A	packages/persistence/src/repositories/customer-address-repository.ts
A	packages/persistence/src/repositories/customer-identity-repository.ts
M	packages/persistence/src/repositories/idempotency-repository.ts
M	packages/persistence/src/repositories/identity-repository.ts
M	packages/persistence/src/repositories/order-repository.ts
A	packages/persistence/src/repositories/promotion-repository.ts
M	packages/persistence/src/schema/index.ts
M	packages/persistence/src/tx-manager.ts
M	packages/persistence/tests/checkout-intent-0012.test.mjs
M	packages/persistence/tests/checkout-invariants.test.mjs
A	packages/persistence/tests/customer-address.test.mjs
M	packages/persistence/tests/migration-0009.test.mjs
A	packages/persistence/tests/phone-checkout-contact.test.mjs
A	packages/persistence/tests/phone-identity.test.mjs
A	packages/persistence/tests/verified-promotions.test.mjs
A	packages/validation/src/delivery-address.ts
A	packages/validation/src/delivery-location.ts
M	packages/validation/src/index.ts
A	packages/validation/src/phone-auth.ts
A	packages/validation/src/promotion.ts
A	packages/validation/tests/checkout-v3.test.mjs
M	playwright.config.ts
```


## Final read-only production inspection

Vercel deployment inspection confirms `dpl_9GSJiRbcwEgMmMJutiNRv4YuNcQs`
currently owns BOTH `yubiefood.com` and `www.yubiefood.com` (also its project
aliases). Its immutable URL is https://yubie-i0j3oj3wl-asyams-projects.vercel.app
and source SHA is `fabb8c2b0b7a495867372b89d60a2af547de69cd`.
This verifies the current production mapping only. A financially compatible,
operator-accepted last-known-good rollback remains UNVERIFIED; do not promote or
roll back to it merely on READY/alias status. No production state was modified.

The handoff has also been persisted in Beads issue yubie-8xs.8 and memory key
full-commerce-mandatory-release-scope. The next session must retain the full-
commerce scope correction even if an older task brief mentions catalog launch.
