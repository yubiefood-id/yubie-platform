# Customer API contracts

Existing envelope: {ok:true,data} or {ok:false,code}. All private responses no-store.
Bounded JSON, proxy authentication, Origin/CSRF checks and launch-profile gates
apply. Only an authenticated trusted edge supplies client-IP context. Browser
headers cannot choose internal endpoints, provider credentials or identity owners.

| Method / resource | Validated contract |
| --- | --- |
| POST /v1/auth/phone/challenges | phone,country,purpose(login/link_phone/reauth),Turnstile token; Idempotency-Key. Link/reauth require authenticated recent proof.202 returns opaque id,pending state,expiresAt,resendAfter; no OTP/account-existence signal |
| GET /v1/auth/phone/challenges/:id | Browser-bound pending/accepted/delivered/failed/expired state; never authorization from delivery |
| POST /v1/auth/phone/challenges/:id/verify | code only; browser/purpose/user binding comes from durable challenge. Single use, session rotation on verified proof |
| POST /v1/auth/phone/challenges/:id/resend | Cooldown checked atomically; rotate/invalidate previous challenge; keep admission limits |
| POST /v1/auth/google | Existing GIS credential/CSRF contract; Google subject remains authoritative |
| POST /v1/account/identities/google | Fresh Google proof plus current recent customer proof;409 assisted conflict; never email-based merging |
| GET /v1/auth/session; POST /v1/auth/logout | Existing session semantics, additive phone/capability/CSRF information; logout revokes server session |
| GET/PATCH /v1/account/profile | Owned profile/name and optional email; does not change identity proof |
| GET/POST /v1/account/addresses | Owned saved addresses; recipient/contact and Indonesia address validation |
| PATCH/DELETE /v1/account/addresses/:id | Owner-conditioned updates;404 for absent/other owner; no order snapshot changes |
| PUT /v1/account/default-address | Owned addressId; atomic single-default change |
| POST /v1/locations/autocomplete,details,reverse-geocode | Minimal fields, Indonesia restriction, bounded search/session token or coordinates; fixed Google API destinations |
| POST /v1/locations/confirm | Explicit point confirmation; server country lookup must return ID. Returns a five-minute receipt bound to the browser and exact point. Saved pin writes require this receipt; it is never persisted with the address |
| GET /v1/promotions/welcome; POST .../claim | Public eligibility/summary without code; claim requires verified user and returns existing/new owned entitlement; dates/rate/scope server-owned |
| POST /v1/checkout-quotes | Version3 contact/address/cart; authoritative non-binding totals, no payment/order creation |
| POST /v1/checkouts | Existing version1 shape/retries retained; explicit checkoutVersion3 requires phone, optional email and validated delivery; caller cannot supply monetary authority |

Keep opaque checkout status tokens and existing session-preparation route. Pending
responses resume the existing checkout; do not rotate away from ambiguity. New
proxy request headers allow CSRF plus existing bounded idempotency/correlation;
response headers include Retry-After and multiple Set-Cookie. No PII in URL query,
telemetry labels, structured error context or public artifacts.
