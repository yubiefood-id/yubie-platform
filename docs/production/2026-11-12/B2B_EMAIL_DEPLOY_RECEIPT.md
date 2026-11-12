# Deployment Receipt — B2B enquiry email pipeline (inert) + prior-compose fix

- Recorded UTC: 2026-11-12T02:30Z
- Source SHA: `6e773fc052d50a062c273a5323f4c0ebc761f496` (main; merge of PR #95 into PR #93's `221c8d9`)
- Contents: PR #93 (B2B enquiry email pipeline, ADR-016) + PR #95 (prior-compose chain accepts `4e799d9` rendered bytes)
- CI: PR runs 5/5 green (quality/persistence/security/containers/browser — PR #93 browser incl. new B2B happy-path e2e; PR #95 quality job once failed on a GitHub artifact-upload API outage, rerun green)
- RC: run 43104172403 (staging deployment approved via pending_deployments API as mAsyamJ); artifact `commerce-release-6e773fc0…` id 13894815805, zip digest `sha256:005ada5a9d5ae0538bc41c1e238602bee403f486111ede7a70c32e4fc3cd2b3b` = locally computed digest; SHA256SUMS OK locally and after scp
- Manifest: `d1854c904252aa20f4a6f8bf2ce6f0ba7b98e0e844014d3a1a09d43577ab705d`; api `@sha256:9970b72a…`, worker `@sha256:0f422422…`; migrations unchanged (0001→0028)

## Backend release (controlled release wrapper)

- Bootstrap: WRAPPER_INSTALLED_NO_DEPLOYMENT_AUTHORIZATION (first attempt for `221c8d9` blocked `PRODUCTION_COMPOSE_NOT_REVIEWED` → root-caused → PR #95; `6e773fc0` bootstrap OK, live compose bytes `dee84300…` preserved, sudoers validated)
- Admission freeze: `YUBIE_CHECKOUT_ADMISSION=disabled` + api recreate (env backed up to `/etc/yubie/production.env.before-b2b-6e773fc0`)
- Preflight: `BLOCKED_OPERATOR_AUTHORIZATION_REQUIRED` — posture production/disabled/lots/support-disabled, provider ipaymu, registry reads OK for both new digests
- Authorization: root-private `authorization.json` (approvedBy mAsyamJ; approvalRef = owner directive in 2026-11-12 session "push production" for the B2B email feature, PRs #93/#95 CI green; 50-minute window; manifest digest + exact baseline image IDs `29faf029…`/`067a90a0…` + ipaymu bound)
- Wrapper result: **BACKEND_DEPLOYED_DISABLED**, verification rerun **ALREADY_DEPLOYED_VERIFIED** (in-container probes: releaseSha, readyz database connected + provider, checkout 503 CHECKOUT_DISABLED, 9 availability variants, privacy boundary)
- Admission re-enabled post-verify (`enabled`, api recreated with `--env-file`, container env confirmed)

## Incident note (honest)

During the freeze step, two api recreates used `docker compose -p yubie-prod …` WITHOUT `--env-file /etc/yubie/production.env`: one attempted under the wrong implicit project name (aborted on a host-port bind conflict — zero impact, old api kept serving) and one crash-looped ~3 minutes on `PURCHASE_OPTIONS_SOURCE=database requires DATABASE_URL` (empty interpolation under sudo's scrubbed env). Restored with the correct `--env-file` invocation (the documented `deploy.sh` pattern). No payment/order/data impact; worker and postgres were never touched. The correct invocation is `docker compose -p yubie-prod --env-file /etc/yubie/production.env -f docker-compose.prod.yml …`.

## Live verification (public)

- `https://api.yubiefood.com/healthz` → `releaseSha 6e773fc0`
- `POST https://yubiefood.com/api/b2b` (invalid consent) → `400 INVALID_REQUEST` (proxy→api path on new release; honeypot + rolling-hour budget live in code)
- `GET https://yubiefood.com/api/checkout/session` → `admission:"enabled"` (chargeable commerce restored)
- Worker `yubie-web-production` version `1b26f7e2-fa2a-46df-b1ab-17ba440b62b7` from the `6e773fc0` RC `web.tgz`; live `/assets/b2b-form-*.js` contains the new honest confirmation copy and NOT the retired "prototype aman" copy; launch chunk = `DIRECT_COMMERCE_PRODUCTION` (form active)

## State (honest)

- **DEPLOYED**: durable B2B pipeline (lead + consent + two email outbox events per submission), API honeypot + rolling-hour budget (3/mailbox/h, 50 global/h), honest form success copy, prior-compose chain maintenance.
- **DORMANT / BLOCKED_OPERATOR**: actual email sending. `B2B_EMAIL_DELIVERY` is unset in `/etc/yubie/production.env` → worker creates NO `growth.email` queue, makes no SMTP connection; outbox events for every submission (including all enquiries submitted since the form went live) hold pending and drain automatically after activation. Owner executes [docs/production/2026-11-12/B2B_EMAIL_ACTIVATION_GUIDE.md](./B2B_EMAIL_ACTIVATION_GUIDE.md): create `enquiry@yubiefood.com` mailbox (Namecheap Private Email), preflight `nc -zv smtp.privateemail.com 465`, add the env block, recreate worker, submit a test enquiry; optional backfill SQL sends the pre-existing stored leads.

## Rollback

- Email: `B2B_EMAIL_DELIVERY=disabled` (or remove block) + worker recreate — pending events hold, nothing lost.
- Full release: redeploy prior verified source/images (`4e799d9` pair `29faf029…`/`067a90a0…`, worker `1b26f7e2`→ prior `9afc64c0`); admission lever R1 (`disabled` + api recreate) for payment safety.
