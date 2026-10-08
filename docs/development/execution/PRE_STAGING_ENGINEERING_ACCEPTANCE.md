# Pre-Staging Engineering Acceptance

Date: 2026-10-08 · Baseline SHA `40098912d9a6bbcce9febd2df958b38b90159899`
("fix(web): release chapter scroll immediately", CI green) · Audit-first
milestone E1–E10 executed on top. Every verdict below cites local evidence
executed in this workspace; nothing was deployed and no external credential
was touched.

## Engineering verdicts

| Axis | Verdict | Evidence |
|---|---|---|
| CODE | PASS | All milestones E1–E9 implemented; `npm run check` exit 0; strict TS builds clean across 12 workspaces. |
| BUILD | PASS | `npm run build` exit 0 (all workspaces incl. verified web artifact contract). |
| TESTS | PASS | No-DB gate: 239 tests, 218 pass, 0 fail, 21 DB-gated skips. PG matrix (pg-smoke, PG17): config 45/45, domain 14/14, validation 2/2, integrations 30/30, application 52/52, persistence 13/13, commerce 1/1, api 28/28, worker 11/11, bot 5/5, web 13/13 — **214/214, 0 fail, 0 skipped**. |
| POSTGRES_FRESH | PASS | migration-0008/0009/0010 fresh-DB tests + CI persistence job (fresh migrate+seed on postgres:17-alpine). |
| POSTGRES_UPGRADE | PASS | 0005/0007-era upgrade paths preserved and green (legacy rows backfilled tokens/totals, constraints intact). |
| PAYMENT_STATE_MACHINE | PASS | `canTransitionPayment` in domain; terminal states sticky — tests: succeeded→expired `stale`, expired→completed `stale`, webhook/poll serialized by `lockById` FOR UPDATE. |
| INVENTORY_LIFECYCLE | PASS | Consume-on-success (zero-delta movement, never re-deducts), release-once (status-guarded UPDATE + row-count gate), FEFO limit 200 + lotCode tie-break, NO blanket expiry sweep — provider-unreachable never releases stock (dedicated test). |
| IDEMPOTENCY_E2E | PASS | Claim+draft+intent+reservation+audit+outbox in ONE TX1 (no poisoned keys — restock/replay test); typed `{kind: success\|failure}` stored outcome (failure replays as failure, never a fake 201); proxy forwards `idempotency-key` via allowlist; browser reuses one key per logical attempt across ambiguous retries (`nextAttemptKey` tests). |
| WEBHOOK_SAFETY | PASS | token+business_id → single tx (inbox+event+transition+inventory+audit+outbox); delivery id `session:event` stable across redeliveries; amount check on completions only; orphan sessions attach by reference; bounded 256 KiB body; out-of-order `stale` → 202. |
| RECONCILIATION | PASS | No time-based release sweep; polls resolve pending-expired payments (delayed success consumes stock); `attach_failed` drafts: poll → ACTIVE ⇒ provider cancel + release (exactly-once), unreachable ⇒ flagged ambiguous; never blind-recreates. |
| PROXY_TRUST | PASS | Live staging-mode smoke: no token → 401 `PROXY_UNAUTHORIZED`, valid token → 200, `/healthz` stays public, webhook exempt (provider auth); staging without `API_PROXY_TOKEN` refuses to boot (CONFIG_ERROR); api-trust suite 28/28. |
| SERVICE_SECRET_SCOPE | PASS | `parseServiceRuntimeConfig(env, api\|worker\|bot)`: bot needs only webhook secrets (no Zammad API token), api never sees support secrets, worker never sees `API_PROXY_TOKEN`; compose `environment:` blocks enforce the same split at the container boundary (rendered config inspected). |
| CONTAINER_BUILD | PASS-LOCAL-REPRO | Bot Dockerfile build chain reproduced on host end-to-end (npm ci → config/domain/application/integrations/persistence/bot builds → server.js); Dockerfile.bot now non-root (`USER yubie`) with healthcheck; in-registry build proven by CI `containers` job (green on `39747bd`, run 37080568839). In-sandbox `docker build` npm-ci fails only on sandbox DNS (EAI_AGAIN to registry.npmjs.org) — environment, not recipe. |
| STAGING_COMPOSE | PASS | `docker compose --env-file infrastructure/staging.env.example -f infrastructure/docker-compose.prod.yml config` VALID: postgres (pg_isready healthcheck) + migrate (`service_completed_successfully` ordering) + api + worker + bot; `YUBIE_ENV` explicit; restart policies; no published ports; SHA-tagged GHCR images. |
| GHCR_ARTIFACT_READY | PASS | `.github/workflows/release-candidate.yml` (workflow_dispatch, exact-SHA checkout, CI-green gate, packages:write only, digests in summary; YAML validated). Publishing itself requires a manual dispatch on trusted main — intentionally not executed here. |
| WEB_ARTIFACT_READY | PASS | `apps/web/wrangler.jsonc` (vars `YUBIE_API_ORIGIN=https://api-staging.yubie.id`, secret-only `API_PROXY_TOKEN`) + `docs/development/STAGING_WEB_DEPLOY.md` + validate-artifact.sh client-bundle secret scan (build-fails on any server-secret name in `dist/client`). |
| DOCS_CONSISTENT | PASS | AGENTS.md §3 → Zammad authority; infrastructure/README → ADR-012 posture + bot/migrate in topology; go-live checklist §B/§D rewritten; 33_VPS + vps/03 + vps/06 supersession notes; M3 staging report archived. |
| **PRE_STAGING_ENGINEERING_READY** | **YES** | No known deterministic P0/P1 transaction defect remains; all engineering gates green with real PostgreSQL. |

## External axes — truthfully blocked (NOT PASSED, never from mocks)

| Axis | Status | What unblocks it |
|---|---|---|
| XENDIT_TEST | BLOCKED_EXTERNAL | Xendit TEST key + dashboard webhook URL + callback verification token + business id; then run the ADR-012 sandbox matrix against staging. |
| GOOGLE_STAGING | BLOCKED_EXTERNAL | Real `GOOGLE_CLIENT_ID` with authorized JS origin for the staging web origin. |
| ZAMMAD_STAGING | BLOCKED_EXTERNAL | Staging Zammad instance + API token + discovered group/priority IDs + article type. |
| WHATSAPP_STAGING | BLOCKED_EXTERNAL | WhatsApp Cloud API number wired into Zammad staging. |
| DNS_TLS_STAGING | BLOCKED_EXTERNAL | `staging.yubie.id` + `api-staging.yubie.id` DNS, Cloudflare, Caddy TLS on the VPS; Cloudflare account access for the web worker deploy. |

## Production posture

- PRODUCTION_READY = **NO**
- PRODUCTION_ACTIVE = **NO**
- Xendit LIVE remains prohibited until the ADR-012 sandbox matrix passes
  against real TEST credentials; marketplace links remain the rollback
  channel.

## Rate-limit budgets (edge-enforced — operator acceptance item)

Defined per route in `docs/development/STAGING_WEB_DEPLOY.md` (checkout
10/min+30/h, auth 10/min, forms 5/min, status poll 60/min). No in-app
rate limiter is claimed as production protection; enforcement belongs to
Cloudflare/WAF and must be recorded here once configured.

## Local verification log (2026-10-08)

- `npm run check` → exit 0 (239 tests / 218 pass / 0 fail / 21 DB-skips)
- `npm run build` → exit 0
- PG matrix on pg-smoke (PostgreSQL 17): 214/214, 0 fail, 0 skipped
- `docker compose … config` → VALID (5 services)
- Workflow YAML (ci.yml, release-candidate.yml) → parse VALID
- Startup smokes (host node, production `dist`): api dev (healthz/readyz/catalog 200); api staging w/o token → CONFIG_ERROR exit; api staging w/ token → gate 401/200 split, healthz public; bot healthz 200.
- Bot image build chain reproduced on host (Dockerfile-equivalent) → PASSED; in-sandbox docker build npm-ci blocked by sandbox DNS only.
