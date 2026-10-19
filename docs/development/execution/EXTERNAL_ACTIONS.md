# External operator actions

No secret values belong in this file, in chat, or in Git. If a replacement credential is created, inject it in the secret store and report only SET or MISSING.

## Do this before any iPaymu call

1. Rotate the iPaymu API key that was pasted into the engineering chat on 2026-10-19. Treat the VA as exposed as well. Do not paste the replacements here.
2. Confirm whether that merchant was sandbox (`https://sandbox.ipaymu.com`) or production (`https://my.ipaymu.com` / production API). Production keys must not be placed in staging.
3. If sandbox is not already open, register at https://sandbox.ipaymu.com/register and read Integrasi for the sandbox VA and API key only.
4. Ask iPaymu support, in writing, the six questions in `IPAYMU_PROVIDER_CONTRACT.md` (cancel by SessionID, lookup by reference or SessionID, duplicate `referenceId`, timeout recovery of `transactionId`, timestamp inside the callback MAC, JSON versus form normalization).
5. Store `IPAYMU_VA` and `IPAYMU_API_KEY` in the API and worker secret scopes after the adapter is deployed. Leave `COMMERCE_PROVIDER=preview` until engineering records a sandbox PASS.

## Staging identity and edge

6. In Cloudflare Zero Trust, open the Access application for `staging.yubiefood.com`. Confirm the include rules are specific emails or groups. Remove Everyone and Bypass if present. This audit received HTTP 403 on the zone Access API, so the membership was not verified.
7. Keep the Worker `yubie-web-staging` workers.dev and preview URLs disabled. They were disabled at audit time (`enabled=false`, `previews_enabled=false`).
8. In Google Cloud Console, confirm the OAuth client used by staging is type **Web application**, with authorized JavaScript origin `https://staging.yubiefood.com`. Do not substitute a Google API key. Set `GOOGLE_CLIENT_ID` on the API service only. Report SET or MISSING.
9. Dispatch `.github/workflows/release-candidate.yml` for the commit that should run in staging, then set `RELEASE_SHA` to that digest. The API observed on 2026-10-19 was still `aa00c53fe543f385eff4237ceeb1a27fdc878fd4`.

## Data and neighboring systems

10. Take a staging Postgres backup and restore it into an empty database. Record the dump timestamp and the restore checksum. Do not use `docker compose down -v`.
11. Do not edit RetroPick Caddy, production DNS, or production payment settings as part of this work.
12. ERPNext and `ops-staging.yubiefood.com` need a separate DNS, Access, and cost approval before any process is installed. Shadow integration in this repository does not provision a server.
13. Zammad and WhatsApp remain blocked until real staging credentials exist. Do not invent them.

## Callback URL when sandbox is later enabled

The notify URL must be the staging API route, for example `https://api-staging.yubiefood.com/v1/webhooks/ipaymu`, and it must **not** sit behind Cloudflare Access. Protect it with callback HMAC, body size limits, and rate limits. The web and admin hostnames stay behind Access.
