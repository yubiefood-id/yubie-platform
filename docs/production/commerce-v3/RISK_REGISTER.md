# Commerce V3 risk register

| Risk | Engineering control | Remaining acceptance |
| --- | --- | --- |
| Preview identity loss | DB independent of payment/listing mode; no runtime memory fallback | Staging restart proof |
| OTP guessing/replay/pumping | HMAC, expiry, atomic single use, purpose/browser binding, limits, Turnstile, country/device budget | Real device/carrier permission, throughput and costs |
| Lost SMS acknowledgment | Stable provider ID; reconcile before retry; bounded TTL | Deployed gateway duplicate/status contract |
| Sensitive diagnostics | No request/provider body logging, HMAC rate keys, encrypted OTP work, bounded purge | Gateway/device/backup retention review |
| SIM swap/recycling | Fresh proof for linking, no reassignment/automatic merge, assisted recovery | Residual phone-auth risk/support policy |
| Account takeover | Unique verified identities, recent-session proof, CSRF/origin checks, token rotation | Google and cross-device UAT |
| Unauthorized address | Owner-conditioned queries, safe404, immutable order snapshot | Privacy and retention approval |
| Maps accuracy/quota/terms | Explicit confirmation/manual fallback, restricted keys, minimal fields, provenance/cache expiry | Google billing/account policy acceptance |
| Promo race/reuse | DB uniqueness, transactional reservation/payment consumption, no browser authority | Campaign dates/scope and Finance review |
| Duplicate payable session | Durable per-principal slots; guest-cookie aliases; versioned legacy recovery | Reconcile ambiguous/unbound historical intents |
| Financial regression | Preserve TX1/provider/TX2 and terminal-state exceptions; shared lock order and PG fault tests | PSP sandbox matrix remains separate |
| Unsafe rollback | Retain additive schema; disable writes; keep compatible webhook/recovery worker | Authorized restore/on-call drill |
| False readiness | Distinct local/mock/staging/live/operator receipts; all5 CI gates | Exact artifact approval; production remains NO-GO |
