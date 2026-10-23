# Verified welcome promotion

Engineering policy; no campaign has been activated. Migration0019 seeds a
**draft**, unapproved `welcome_v3` campaign. `YUBIE15` is an identifier, not a
credential or proof of eligibility. A leaked code alone cannot grant a discount.

The default is 15% of eligible product subtotal, rounded down to whole IDR.
Shipping/tax are excluded. No stacking. The campaign owns approved rate, product
scope, start/end dates and approval reference. Only one welcome campaign may be
active. Active configuration requires recorded approval; operators must approve
the exact configuration and release before activation. No application/customer
endpoint activates campaigns.

Claiming requires a valid application session and a persisted verified phone
identity belonging to that same user. Cached profile flags, email similarity,
WhatsApp sender numbers and historical delivery phones are not identity proof.
Existing accounts qualify when they have no attributable paid history; unresolved
owned payments block new allocation until resolved. A currently possessed guest
checkout cookie is also checked. Durable guest/login slot aliases are a required
part of the dependent checkout milestone, not an assumed existing capability.

Unique constraints allow one entitlement per campaign/customer/phone identity.
Repeated and concurrent claims return the existing owned entitlement. The public
offer response never reveals the code; successful authenticated claims do.
Authentication is transactional and does not require newsletter/marketing consent.

New checkout pricing revalidates session, phone ownership, approved campaign,
entitlement ownership, history and eligible catalog-priced lines inside the
transaction. An active reservation blocks competing new customer checkouts.
Order, payment intent, promotion reservation, stock, audit and outbox commit
together before provider creation. Stored checkout outcomes replay before new
eligibility checks; historical confirmed monetary snapshots are never repriced.

Authoritative success consumes the reservation once. Refunds keep it consumed.
Definitive provider rejection, failure, expiry or cancellation releases it in the
same financial transaction. Campaign expiry, local timeout, lost acknowledgment,
worker restart or a missing provider session ID never authorize release. Unknown
payments remain held for reconciliation, including repeated recovery sweeps and
the crash window before an acknowledgment is persisted. Late/contradictory
captures use the existing exception workflow; they do not rewrite agreed totals.

Provider item amounts sum to the final charged total. iPaymu uses one aggregate;
Xendit uses normal product lines when they match, and an aggregate basket for
discounted/shipping totals. This avoids borrowing unsupported negative-discount
item semantics from a different Xendit API. See the
[Payment Session contract](https://docs.xendit.co/apidocs/create-session).
Synthetic contract tests are not real PSP acceptance.

Checkout preview cannot grant a payable promotional session. Customer checkout
and claim endpoints remain launch-profile gated. Rollback disables customer
writes and preserves compatible reservation/reconciliation code plus additive
tables. The unrestricted legacy promotion backend is not a safe rollback image.

Financial callbacks and post-provider recovery writes lock and reread the payment
before mutation. Orphan callbacks attach only to that locked record. Duplicate
callbacks cannot restore stale pending state after consumption. Accepted
attach-failure cancellation uses the same financial transition as an authoritative
callback, including promotion, inventory, audit and outbox settlement.
