# Commerce release evidence

This report distinguishes implementation/testing from deployment and live
activation. Final publication/deployment receipts must name their actual SHA,
image digests, Worker version and UTC time; unpublished artifacts are not deployments.

## Baseline

- Original local SHA: `77ad316621ec5e76219795406dc22b74b8745d78`; remote main matched.
- Ten intentional UI/test modifications preserved, including the waitlist and
  contact/navigation refinements. A pre-existing potentially sensitive untracked
  operator file was snapshotted privately and excluded from commits.
- Protected snapshot: `~/.local/state/yubie/releases/20261024T181651Z`.
- Observed API: `379f978609f82305126ad7100c8dd6befd8022a8`; health/readiness 200,
  PostgreSQL connected, commerce provider preview.
- Observed Worker: `e6c5a4dc-f3d9-4fdc-b710-97904e680cea`.
- Both production/candidate homepages returned 200. Each loaded 25 scripts and
  one stylesheet without asset failure or page exception. This was homepage-only
  baseline inspection, not full commerce acceptance.

## Implementation

Approved component inventory, transactional onboarding with evidence and replay
protection, QC/expiry gating, FEFO reservations, recall fulfillment holds and
public availability now share PostgreSQL authority. Server quotation owns
prices, promotion eligibility and shipping approval. Existing retail prices
remain unchanged.

Checkout distinguishes disabled admission from pending/unknown outcomes,
preserves opaque attempts across refresh/tabs, and recovers terminal attempts
through principal-owned idempotency bindings. Return/cancel pages retrieve
verified state. The payment inbox persists verified minimal notifications
before acknowledgment; the independent worker reconciles authoritative state.
Polling revalidates proof under lock. Rejections/exceptions remain actionable,
and financial exceptions freeze new payable checkout.

Additive migrations: 0023 inventory/shipping approvals and fulfillment holds;
0024 durable payment notification inbox; 0025 owned checkout recovery binding.
Older payment workers cannot drain 0024, so rollback compatibility requires
explicit qualification while payments/notifications remain unresolved.

## Acceptance boundaries

- Local Chromium commerce acceptance: **20 PASS** desktop/mobile, including
  disabled checkout, unverified stock, cancel-return truth, ambiguity after
  refresh, two tabs and accessibility. Synthetic fixtures; no provider charges.
- PostgreSQL targeted acceptance passed FEFO, concurrent last-unit allocation,
  up to 100 duplicate submissions, component contention, operation replay,
  stale counts, ledger immutability, recall holds and notification restart.
- New regressions were observed failing before their fixes: disabled→pending
  classification; shared component demand; unapproved shipping; mismatched poll
  amount; two-tab resubmit; terminal recovery; stale poll identity; lost callback
  incident signals; recall after payment; production admission default.
- Full frozen-source quality/CI, complete PostgreSQL suites, container scans,
  complete browser matrix and release artifact publication are required before
  CODE_READY. Final receipts supersede incremental local results above.
- Real sandbox matrix: **BLOCKED_EXTERNAL**, all ten steps unaccepted until
  real isolated sandbox evidence is supplied. Mocks are not sandbox acceptance.
- Production stock quantities: **UNKNOWN**, not initialized. See INVENTORY_REPORT.
- Production deployment: **BLOCKED_OPERATOR** pending privileged execution.
- Live payment admission: **DISABLED**. Merchant, stock, shipping and Finance
  evidence is incomplete. Verdict: **FULL_COMMERCE_NO_GO**.

## Required status ledger

Record final evidence separately for `CODE_READY`, `INVENTORY_VERIFIED`,
`SANDBOX_ACCEPTED`, `MERCHANT_PRODUCTION_READY`, `BACKEND_DEPLOYED`,
`WEB_DEPLOYED`, `PRODUCTION_SMOKE_PASSED` and `LIVE_PAYMENT_ENABLED`.
Use PASS only for observed acceptance. A healthy old deployment is not proof
that this release was deployed. Current privileged image digests, database
balances and provider reconciliation health remain unverified.

## Frozen source validation receipt

Source: `fe8366a1a46376d901ef4489082b31ffd81dffd9`. Local validation completed
2026-10-25 UTC; required GitHub checks and immutable image publication are still
pending. This is not a production deployment receipt.

- `npm run check`: PASS (lint, TypeScript, secret/payment scanners, release
  tests and workspace tests). Database-gated cases skipped here were exercised
  by the separate PostgreSQL run below.
- PostgreSQL 17: persistence 77/77, API 56/56, assistant 40/40, worker 29/29,
  bot 8/8, integrations 69/69; no failures or skipped cases. An old promotion
  fixture was corrected to supply complete provider proof; assertions retained.
- Full mock browser matrix: 224/224 PASS, zero flaky/failed/not-run cases;
  desktop/mobile Chromium, Firefox and WebKit. Sanitized evidence:
  `artifacts/qa/2026-10-25T01-31-00-160Z/mock`.
- Semgrep financial rules: 0 findings across 312 targets. Gitleaks history:
  no credential findings after an exact fingerprint exclusion for the public
  backend Git SHA on baseline line 14. No credential pattern was disabled.
- Browser access-boundary contract: 1 PASS; ERP harness privacy contracts:
  JavaScript 1 PASS and Python 1 PASS.
- Clean production-profile Vinext artifact: PASS; release manifest reports
  the source SHA above and `dirty=false`. Wrangler production dry-run PASS,
  104 asset files, existing ASSETS binding retained. Build artifact digest:
  `sha256:16acbf71e40c83b498ccf8b90c6090379d8c3ed89e8efb3a80857d1f430a7de6`.
- Local worker container build: BLOCKED_EXTERNAL by registry/network failures
  during npm installation. No image build or scan PASS is claimed from it.
- Real sandbox acceptance: BLOCKED_EXTERNAL; no real sandbox session/payment
  was completed. Live merchant/KYC/domain/IP/rotated credentials/Finance,
  shipping approval and physical lot/QC evidence remain unverified.
- Production backend and frontend changes: NOT DEPLOYED. Privileged VPS
  execution is unavailable; sudo requires a password and the release key
  cannot log in as root. Frontend deployment waits for backend compatibility.
