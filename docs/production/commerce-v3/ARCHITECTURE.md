# Commerce V3 architecture

Keep the existing modular monolith and PostgreSQL. Domain owns identity/address/
campaign/checkout invariants. Application owns use cases and provider-neutral
ports. Persistence owns all SQL/locks/migrations. Integrations own SMSGate,
Google HTTP contracts and payment adapters. API validates/authenticates bounded
requests; web uses the existing same-origin proxy. Worker drains durable effects.

Customer persistence is independent of payment activation. Configured PostgreSQL
serves identity, OTP, addresses and campaigns even in preview; unavailable storage
fails closed. In-memory adapters are explicit test dependencies only.

OTP: rate/admission checks → challenge+encrypted send work+audit COMMIT → SMSGate
POST with stable message ID → status reconciliation. Verify under lock → single
use + identity/account + rotated hashed session + audit COMMIT. No raw OTP is
returned, logged or stored in plaintext. Delivery acceptance is not verification.

Keep users.id and legacy Google sessions. Add provider identities with unique
subjects. Backfill Google subjects; preserve legacy column/dual reads during
compatibility. Linking needs a current authenticated session and fresh proof;
conflicting owners remain separate. Staff sessions never authenticate customers.

Addresses use one shared editor with manual fallback. Persistence is explicit on
save or order submission. Recipient contact is not login identity. Resolve an
owned saved address into an immutable order snapshot. Provider content and
expiring coordinate caches remain separate from durable customer-authored data.

Checkout TX1 locks customer/browser checkout slots, checks campaign/entitlement,
computes prices/shipping, snapshots address/contact/promotion, reserves discount
and stock, and commits audit/outbox. Provider create remains outside transactions.
Existing attachment/reconciliation saga remains. An authoritative terminal payment
transition updates promotion, inventory, order and slot state together. Ambiguous
creates retain reservations; contradictory late captures enter existing exceptions.

Legacy requests keep intent-v1/request-v1 hash semantics. Explicit V3 requests use
canonical normalized contact/address hashes. Possessed guest-cookie slots are
checked after login. Multiple/unbound historical pending intents require explicit
recovery, never an arbitrary winner or a new payment.

Launch profiles remain the release authority. New customer endpoints inherit the
catalog gate. OTP/provider configuration cannot enable commerce. Maps keys are
restricted by platform/API; private credentials never enter client bundles.
No direct WhatsApp OTP or alternate payment path is introduced.
