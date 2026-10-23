# Commerce V3 release decision

24 October 2026 merge checkpoint: **NO-GO for transactional Commerce V3**.
Catalog-only release may proceed separately after its exact artifact acceptance.
Payments, OTP and Maps are not activated by merging source. The welcome campaign
seed remains draft/unapproved. WhatsApp acceptance is tracked separately.

## Before a Commerce V3 staging acceptance run

| Owner | Required work / evidence |
| --- | --- |
| Engineering | Finish public phone/country/OTP and account-linking UI, entitlement claim UI, authoritative quote endpoint, explicit V3 checkout HTTP adapter and three-step checkout with saved/manual/Maps address. Integrate receipt validation without storing or hashing renewable receipts. Complete authenticated/guest logout and recovery UX without abandoning unresolved payment. |
| Infrastructure | Approve isolated web/API/worker/PostgreSQL targets and exact source/image digests. Verify the actual deployed schema; apply only missing migrations through0021 after backup and isolated restore. Do not assume the historical staging runbook's schema0010 observation is current. Keep production profile unchanged. |
| Security | Protected DATABASE_URL, APP_ORIGIN and API_PROXY_TOKEN; trusted overwritten client-IP ingress with direct origin blocked. Named operator access, separate customer/staff OAuth clients, secure cookies and retention acceptance. |
| OTP operator | Approved private SMSGate device/SIM/carrier pilot, endpoint and protected worker credentials; OTP secrets/encryption, allowed countries and Turnstile hostname/action setup. See OPERATOR_ACTIONS.md for exact implemented variable names. No real user numbers or raw OTP in artifacts. |
| Google operator | Restricted server/browser Maps keys, Map ID, API enablement and billing/quota; allowed staging referrers and actual device tests. Manual entry must work without Google. Configure approved Google sign-in origin/audience for real linking tests. |
| Product / commercial | Approved price/media/specification, shipping coverage/charges, campaign activation/dates/scope and refund policy; confirm contact email and legal/privacy copy. A public coupon string grants no entitlement. |
| Payments operator | Isolated PSP sandbox credentials and callback/reconciliation contract; verify phone-only hosted checkout with optional email. iPaymu's omitted buyerEmail fixture proves only request shape, not that its hosted form permits phone-only completion. Never invent an email. |
| QA / operations | Real OTP delivery and verification; wrong/expired/replayed code and abuse limits; Maps permission denial/outage/manual entry; cross-user address/identity rejection; phone-only guest and authenticated checkout; promo concurrency; payment ambiguity, duplicate callbacks, recovery, backup/restore, alerts, on-call and named UAT. |

These include engineering work, not just credentials or a verification checklist.
Mocked browser/provider fixtures and green CI do not satisfy live staging axes.

## Catalog-only production path

1. Build and verify the exact green main commit's `PUBLIC_CATALOG_NO_SALES`
   artifact with payments disabled. Record source SHA, manifest digest and CI
   archive digest; do not deploy an untracked or rebuilt substitute.
2. Verify the approved project/team and staged deployment URL, four product pages,
   nine variants, image/content approval, contact/legal pages, navigation, security
   headers and absence of transactional APIs in the actual artifact.
3. Record release owner, deployment window, named on-call and a previously approved
   rollback deployment. Stage the production artifact without assigning domains,
   verify it, then promote that same deployment under the repository runbook.

No production deployment or provider acceptance receipt is asserted here. A source
merge alone does not make the website operational or authorize live payments.

## Rollback

Disable customer transactional writes through the approved launch profile and keep
pending-payment recovery code available. Retain additive schema, immutable orders,
verified promotion checks and recovery bindings; do not revert to code-only promo
pricing or select/cancel a financial winner. Restore the approved prior catalog
artifact for the public site. A database restore requires an isolated tested backup
and operator authorization, never destructive migration reversal or volume deletion.
