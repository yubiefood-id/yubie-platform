# Expand-only migration and compatibility

Recheck main/migration numbering at each PR. Current next migration is0017.

| Migration | Additions and constraints |
| --- | --- |
|0017 identity/OTP | auth_identities unique(provider,subject), one phone identity per user; backfill Google subjects; relax legacy google_sub nullability; durable challenges, rate buckets and encrypted delivery jobs with expiry/state indexes |
|0018 addresses | customer_addresses owner FK, bounded address fields/provenance, one active default per user; provider coordinate-cache TTL separate from durable addresses |
|0019 promotions | campaigns, unique customer/phone entitlements and redemption history; one reserved/consumed slot per entitlement, order/payment FKs and active/expiry indexes |
|0020 checkout | nullable customer_email, contact/identity/address/promotion snapshots and checkout hash version; principal slot aliases for one unresolved attempt |

Do not rewrite historical email, ownership, lines or money. users.id and session
tokens remain stable. New Google writes dual-write the retained legacy subject.
No unverified historical order phone becomes an authentication identity.

Legacy checkout requests preserve exact version1 canonicalization and stored
responses. V3 normalizes phone/address before version3 hashing. Existing guest
cookies continue to identify their pending attempts after account login. Multiple
or unbound historical pending rows block safe cutover until explicitly reconciled;
the migration must not select/cancel/delete a financial winner.

All business writes use transaction-scoped repositories. Document and enforce
principal/identity → entitlement → payment/inventory lock order. Deterministically
sort multiple principal/identity locks. Migration tests cover fresh install,
Google/session/order upgrade, unchanged monetary values and repeated application.

Only isolated disposable PostgreSQL is authorized for engineering migration tests.
No automatic staging/production migration. Rollback disables customer writes and
retains compatible recovery code and additive schema. An old backend that grants
discounts from code text alone is never a compatible rollback image.
