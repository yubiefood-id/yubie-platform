# Operator acceptance and configuration

No production configuration has been changed. Identity defaults disabled.
Use approved synthetic staging identities; obtain explicit authorization before
real SMS, carrier spend, live payments or customer-facing activation.

| Configuration in code | Required ownership/evidence |
| --- | --- |
| `OTP_PROVIDER=smsgate` | Approved private pilot; leave unset/disabled otherwise |
| `DATABASE_URL` | Protected PostgreSQL, migrations, backups and restore acceptance |
| `OTP_HASH_SECRET` | Protected stable random secret, at least 32 characters |
| `OTP_DELIVERY_ENCRYPTION_KEY` | Protected base64 32-byte encryption key; rotation needs outstanding-challenge drain |
| `OTP_ALLOWED_COUNTRIES` | Reviewed ISO country CSV; initial real-send allowance ID |
| `APP_ORIGIN` | Exact approved HTTPS storefront origin |
| `TURNSTILE_SECRET_KEY` | API-only protected key; hostname and `phone_auth` action acceptance |
| `SMSGATE_BASE_URL` | Worker-only private HTTPS gateway; approved TLS/network access |
| `SMSGATE_USERNAME`, `SMSGATE_PASSWORD` | Worker-only protected gateway credentials |
| `SMSGATE_DEVICE_ID`, `SMSGATE_SIM_NUMBER` | Approved Android/device/SIM, carrier rules/costs and uptime owner |
| `WEB_TRUST_CLOUDFLARE_IP` | Default false; true only with overwritten ingress IP header and blocked direct origin |
| `API_PROXY_TOKEN` | Existing protected web/API hop credential; never browser-visible |
| `YUBIE_LAUNCH_PROFILE` | Preserve `PUBLIC_CATALOG_NO_SALES`; staging change requires its own reviewed configuration |
| `MAPS_PROVIDER=google` | Default disabled; explicit approved staging Maps activation |
| `GOOGLE_MAPS_SERVER_KEY` | API-only restricted key for Places API New and Geocoding; protected billing/quota approval |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Restricted browser key for Maps JavaScript only; exact approved HTTP referrers |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Approved Google map ID for draggable advanced markers; no invented fallback ID |

Engineering can prepare code, migration, isolated DB tests, draft PRs and disabled
artifacts. Operators must accept SMS send/status reconciliation on the actual
gateway, device/network restart, Turnstile/origin/IP trust, abuse budgets and named
on-call coverage. REST acceptance is not evidence of delivered SMS.

Maps billing/key restrictions, shipping serviceability, campaign approval,
payment-provider sandbox acceptance and final exact-artifact release approval
belong to later milestone acceptance. This list will be extended from those
implemented contracts; it does not claim they are operational now.

Maps requests use persistent admission limits: 20/browser/minute, 40/IP/minute,
500/global/day. Provider calls occur after budget commit, outside database locks.
Review these pilot budgets alongside project API quotas and billing alerts.
Missing keys, denied location permission, empty results or provider outages keep
manual entry available. Product screenshots or synthetic fetch tests are not
evidence of Google billing, geolocation or real map delivery acceptance.

Address storage accepts explicit customer-written fields, not Google response
blobs. Search/preview results remain transient. Confirmed coordinates expire
after 30 days, are hidden after expiry, and are cleared by the independent hourly
cleanup job. Editing an unchanged pin retains its original expiry. Privacy/terms
text, actual Google attribution rendering, key restrictions, quota exhaustion,
device location accuracy and named operator UAT must be accepted before release.
