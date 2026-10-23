# Commerce V3 implementation contract

Durable work tracking: Beads epic yubie-8xs, ordered children .1–.7. This document
describes approved behavior, not a second task ledger.

R0 re-establishes exact baseline CI/local install/check/build and records source
versus operator acceptance. All original local edits remain in their worktrees.

PR A adds durable phone identities, SMSGate delivery, OTP admission/verification,
session rotation, Google compatibility/linking and fail-closed composition.
Defaults: six digits, five minutes, five attempts,60s resend, five sends/hour per
phone/browser, twenty/hour per trusted IP, thirty/hour and two hundred/day pilot
global budget. Real sends require configured private gateway, allowed country,
Turnstile and protected keys. Test delivery is dependency-injected only.

PR B adds owner-scoped address book/defaults, shared Maps/search/manual editor,
Indonesia serviceability, explicit pin confirmation and provenance/retention.
Manual checkout remains available without a map/pin. Never store page-open GPS.

PR C adds inactive approved campaigns, idempotent verified claims, single active
reservation, authoritative payment consumption/release and no public code reveal.
Existing historical order amounts and pending monetary snapshots are preserved.

PR D integrates KONTAK/PENGIRIMAN/PEMBAYARAN, optional email, quotes, durable
single-checkout slots and guest/login aliases. Version legacy hashes explicitly;
Xendit customer remains omitted and absent iPaymu buyerEmail is omitted.

PR E completes independent specification/security review, all five CI gates,
real PostgreSQL fault/concurrency tests, Playwright responsive/accessibility tests,
all required documentation and a secret-free candidate evidence receipt.

Use expected migrations0017(identity/OTP),0018(address),0019(promotion),0020
(checkout compatibility), rechecking numbering before creation. Expand only;
retain historical IDs/records. Rollback gates customer writes and keeps compatible
recovery code/schema; do not restore the unrestricted promo implementation.

No implementation PR is merged or deployed automatically. SMSGate/Maps/PSP real
tests and activation stop at separately authorized operator boundaries.
