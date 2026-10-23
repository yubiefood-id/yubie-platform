# Commerce V3 current state

Baseline audited 2026-10-23: local/remote main
`cd629593cc712ee76193d5f7554ace351960c3b1`. Dedicated implementation worktree:
`/home/ubuntu/project/yubie-commerce-v3`. The original dirty website checkout and
ERP worktree remain untouched. No deployment or real customer/provider operation.

The table below records the R0 baseline, before V3 changes.

| Axis | Source evidence | Acceptance |
| --- | --- | --- |
| Baseline CI | Rerun39916788355 on exact SHA: quality,persistence,security,browser,containers | PASS all5; no provider/live acceptance implied |
| Identity | Google sub in users, nullable email, hashed application sessions; google_sub NOT NULL | Implemented Google only; real provider acceptance absent |
| Composition | createAppContext chooses durable customer state from payment/listing mode | Preview/static can silently use memory even with DATABASE_URL |
| Phone / OTP | No verification service, challenge/rate tables or phone identity | Not implemented |
| Addresses / Maps | Checkout has free-text recipient/address; account shows orders/profile | No address book or Maps integration |
| Promotions | quotePromotion accepts public YUBIE15; UI computes and reveals discount | No ownership, campaign approval, entitlement or redemption lifecycle |
| Checkout | customerEmail required in schema/domain/ports/repositories | Phone-only path absent; nine server-priced catalog variants |
| Financial safety | TX1 draft/intent/lot reserve; external provider call; TX2 attach; durable reconciliation | Preserve existing behavior and regression tests |
| Identity hash | intent-v1/request-v1; guest-cookie and user principals | Preserve legacy replay; explicit V3 migration needed |
| Launch | PUBLIC_CATALOG_NO_SALES disables customer transactional routes | Retain; dynamic sandbox artifact required for customer flows |
| Providers | Xendit omits inline customer; iPaymu sends buyerEmail; both guarded | No new real OTP/Maps/payment receipts |
| Migration | Latest0016_yubi_reentry | Allocate0017+ after rechecking main |

Source authorities: domain identity/orders/promotions, application auth/checkout
and payment use cases, API composition, persistence schema and migrations,
existing same-origin web proxy, ADR012 and the fast-track launch-profile decision.
Historical deployment receipts are historical observations, not acceptance of V3.

External dependencies: private SMSGate device/SIM and approved carrier use,
protected endpoint/keys, Turnstile, restricted Google Maps keys and billing/quota,
approved campaign dates/scope, real PSP sandbox testing, named operators and
privacy/retention/recovery acceptance. Production payments remain disabled.

## Implementation evidence

PR A: [draft PR29](https://github.com/yubiefood-id/yubie-platform/pull/29), exact
head `0e3efbbe4a9f90c6562ae387292d4747479dff7f`. Durable phone/Google identities,
encrypted expiring OTP, abuse budgets, verified sessions, guarded API/proxy and
worker delivery are implemented. Preview payments no longer select memory for
customer identities. [CI39970968906](https://github.com/yubiefood-id/yubie-platform/actions/runs/39970968906)
passes all five gates. Thirteen final API/identity regressions used real disposable
PostgreSQL and synthetic delivery. Separate standards/security and spec reviews
found five gaps, all fixed and re-reviewed. No live SMS/provider acceptance.

PR B: [draft PR30](https://github.com/yubiefood-id/yubie-platform/pull/30) contains
owner-scoped saved-address/default CRUD, migration0018, Maps previews and shared
editor/account UI. New pins require a short-lived browser/point-bound receipt
after server country validation; expired pins are hidden/cleared independently
from customer-authored addresses. Six focused real-PostgreSQL/API cases and eight
mocked browser cases pass, including populated upgrade, unchanged historical
orders, callback races, manual fallback, responsive widths and accessibility.
Specification/security review findings were fixed and re-reviewed. Local full
repository and DB gates pass. PR CI is tracked separately in TEST_MATRIX.md;
real Google/device/key/quota acceptance remains BLOCKED_EXTERNAL.

Promotions and phone-first checkout remain subsequent milestones. V3 is not a
complete commerce candidate or production GO. Neither draft PR has been merged.
