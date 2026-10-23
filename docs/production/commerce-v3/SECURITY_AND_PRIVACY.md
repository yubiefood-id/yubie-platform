# Commerce V3 security and privacy

Identity candidate, not provider or production acceptance. Customer `users.id`
remains the owner; Google subject and verified E.164 phone are unique identities.
Never merge by email or an old delivery phone. Conflicts require assisted resolution.

OTP admission requires the trusted web/API hop, same-origin signed CSRF, browser
binding, Turnstile host/action verification, country allowlist, durable phone/IP/
browser/global budgets and resend cooldown. Exact accepted idempotent retries
return the persisted request without consuming CAPTCHA again. Pre-CAPTCHA
admission commits bounded request counters (10/browser/hour, 40/IP/hour,
120/global/hour), then calls the provider outside database transactions/locks.
Delivery rechecks the current country allowlist. Storage-only retention runs in
the hourly cleanup queue even when SMS/customer routes are disabled. Application sessions
are issued only after single-use proof; linking also checks a current recent
session. Session rotation/revocation, identity, proof consumption and audit share
one PostgreSQL transaction. Storage outages fail closed independently of payments.

OTP verifiers use keyed SHA-256; queued phone/code payloads use AES-256-GCM with
12-byte nonces and explicit 16-byte tags. Keys are protected server configuration.
Delivery payload is cleared after the first send attempt; ambiguous outcomes use
status reconciliation only. Expired challenge secrets are cleared by the sweep;
challenge metadata and expired rate buckets are deleted after their retention
window (challenge metadata: 24 hours). No OTP, full phone, address, precise pin,
credential or raw provider response belongs in logs or public evidence.

`WEB_TRUST_CLOUDFLARE_IP=true` is permitted only when the deployed ingress
overwrites `CF-Connecting-IP` and direct origin access is blocked. The proxy
discards browser-supplied internal IP/origin headers. Without approved trusted IP
context, OTP admission returns 503. Production API additionally requires its
existing `API_PROXY_TOKEN`. Browser sessions are HttpOnly, SameSite=Lax and Secure
on the configured HTTPS origin. CAPTCHA is transactional proof, not marketing consent.

Address mutations recheck the owned customer session in the transaction and
condition repository operations on the owner. Defaults serialize per owner and
have a unique partial index. A supplied pin needs a short-lived signed receipt
issued after the server's country lookup returns ID. The receipt binds browser,
coordinates and expiry; changing the point or copying it to another browser fails.
Only the confirmed point is stored, never its receipt or provider response blob.
Existing order address/money snapshots are independent and remain unchanged by
address edits/deletion. Country lookup is not street-address verification.

Location requests commit pseudonymous budgets before network work. Search labels
remain transient; expired pin coordinates are hidden on reads/edits and cleared
by the independent cleanup job. UI editing contexts reset pending requests;
functional updates preserve customer-written fields during asynchronous lookup.
Moving a point invalidates older reverse/confirmation responses.

Promotion reservation/payment races, full checkout integration and live Maps
acceptance remain subsequent requirements. Identity or mocked browser tests do
not establish their readiness. Production activation remains blocked.
