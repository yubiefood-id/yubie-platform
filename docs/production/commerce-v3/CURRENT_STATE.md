# Commerce V3 current state

Baseline audited 2026-10-23: local/remote main
`cd629593cc712ee76193d5f7554ace351960c3b1`. Dedicated implementation worktree:
`/home/ubuntu/project/yubie-commerce-v3`. The original dirty website checkout and
ERP worktree remain untouched. No deployment or real customer/provider operation.

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
