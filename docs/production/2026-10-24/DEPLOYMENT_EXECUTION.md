# Deployment Execution Log — 2026-10-24

Running log; every entry names evidence (SHA, run, digest, URL, timestamp UTC). Statuses use the release vocabulary. This file is updated as execution proceeds — unexecuted steps say NOT_RUN, never predicted as done.

## Baseline (verified)

- `origin/main` = `007808f2255c4753602cbbb24c0b5fcc551e2eb7` — CI run 40025843576 all 5 checks success (quality, persistence, security, browser, containers).
- Migrations present through `0021_checkout_guest_bindings.sql`.
- Live state at start: `yubiefood.com` = Vercel static catalog (git deploys disabled); `staging.yubiefood.com` = Worker behind Cloudflare Access; `api-staging.yubiefood.com` = API `aa00c53` (STALE, pre-Commerce-V3) behind Caddy on Contabo 84.247.158.36; `support.yubiefood.com` = live Zammad (same VPS); `api.yubiefood.com` = NO DNS.
- iPaymu production capability: refused at four layers (adapter/factory/config/scanners) — by design.
- Credentials: no iPaymu secrets anywhere (verified by name-presence); GitHub `sandbox` environment secret listing empty; 2026-10-19 pasted pair considered compromised.

## Code changes (PRs)

| PR | Scope | Status |
|---|---|---|
| #34 `feat/ipaymu-production-path` | `IPAYMU_ENV=production` across 4 layers + `DIRECT_COMMERCE_PRODUCTION` launch profile + scanner allowlists + negative test matrix | OPEN (CI) |
| #35 `feat/worker-support-disabled` (stacked) | `SUPPORT_PROVIDER=disabled` bot-off worker; compose Commerce V3 env pass-throughs; bot opt-in profile; regression tests | OPEN (CI) |
| #36 (this docs PR) | ADR-013 + 2026-10-24 release artifacts | OPEN |

## Release candidate

- Target SHA: `<filled after PRs merge>` — RC workflow run `<id>` NOT_RUN yet.
- Expected digests: `ghcr.io/yubiefood-id/{yubie-api,yubie-worker,yubie-admin}:<SHA>` (+ bot built but NOT deployed).

## Production backend (Contabo, compose project `yubie-prod`)

- Isolation: own project name, volumes (`yubie-prod_pgdata`), internal network, DB credentials; Zammad/RetroPick untouched. NOT_RUN
- Fresh DB, migrations `0001–0021` once via migrate one-shot. NOT_RUN
- Post-migration `pg_dump` baseline + restore verification into scratch container. NOT_RUN
- api+worker up (bot profile omitted), `COMMERCE_PROVIDER=preview`, `SUPPORT_PROVIDER=disabled`, `YUBIE_LAUNCH_PROFILE=DIRECT_COMMERCE_PRODUCTION`. NOT_RUN
- Caddy: append-only `api.yubiefood.com` route, reload (not restart). NOT_RUN
- Health: `/healthz` SHA match, `/readyz` 200, webhook route reachable → 503 `WEBHOOK_NOT_CONFIGURED` (no forged events sent). NOT_RUN
- DNS B1 pending → verify via host-header curl to VPS IP until record exists. NOT_RUN

## Admin

- Deploy via `docker-compose.admin.yml` behind Caddy + Cloudflare Access on `ops.yubiefood.com`. NOT_RUN (blockers B3/B4).

## Production web (Worker)

- `apps/web/wrangler.prod.jsonc` added; deploy BLOCKED_OPERATOR_SCOPE (B2) — Vercel catalog stays live meanwhile.

## Sandbox acceptance

- Prep complete in-repo; execution BLOCKED_EXTERNAL (B5–B8). Status: `IPAYMU_SANDBOX_ACCEPTED = NOT_RUN`.

## Cutover snapshot (fill at cutover)

- Prior apex DNS/Worker route state: `<capture before switching>` NOT_RUN.

## Live activation

- `IPAYMU_LIVE_ACCEPTED = NO` / `FULL_COMMERCE_LIVE = NO_GO` until ADR-013 gates pass.
