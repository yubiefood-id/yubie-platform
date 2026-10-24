# Rollback Plan — 2026-10-24 Production Release

Principle: financial callback processing and reconciliation remain available in EVERY rollback state, even when new checkouts are disabled. Never destroy data to roll back code.

## R1 — Freeze NEW checkouts (any suspicion of money mishandling)

**Primary lever: `YUBIE_CHECKOUT_ADMISSION=disabled`** (implemented 2026-10-24; validated by `apps/api/tests/checkout-admission.test.mjs`). Edit `/etc/yubie/production.env` on the VPS: set `YUBIE_CHECKOUT_ADMISSION=disabled` and keep `COMMERCE_PROVIDER` **unchanged** (still on the PSP), then:
```
docker compose --env-file /etc/yubie/production.env -p yubie-prod \
  -f infrastructure/docker-compose.prod.yml up -d api worker
```
Effect: `POST /v1/checkouts` → 503 `CHECKOUT_DISABLED` before any work; the iPaymu webhook route, payment reconciler, checkout status/recovery reads, reservation resolution and payment-exception outbox keep running normally for every in-flight session.

**Do NOT switch `COMMERCE_PROVIDER=preview` during an active incident with in-flight iPaymu payments.** Verified behavior: under preview, the `/v1/webhooks/ipaymu` route returns 503 `WEBHOOK_NOT_CONFIGURED` (gated on `paymentMode==="ipaymu"`) and the reconciler's provider is null (no polling) — callbacks and reconciliation for existing sessions would stop. Only after the reconciler shows zero pending/ambiguous payments may the provider be flipped to `preview`/`disabled` as a deeper rollback.

Freeze order under fire: admission freeze (this section) → verify webhook + reconciler still processing → Finance decision on provider-level rollback (R2) once pending queue is drained.

Proof matrix (all executed in CI): `apps/api/tests/admission-freeze-recovery.test.mjs` (existing session identifiable; new sessions refused; authenticated callback for the existing session applies with exactly-once stock; redelivery after restart is a duplicate no-op; second successful transaction raises a durable exception whose outbox entry is produced under the freeze; lifting the freeze reopens checkout) and `packages/application/tests/reconcile-payments.test.mjs` ("reconciler keeps resolving payments while checkout admission is frozen"). Initial production ships with `YUBIE_CHECKOUT_ADMISSION=disabled` pinned by `scripts/tests/production-env-contract.test.mjs`.

## R2 — Roll back API/worker images

```
# on VPS: restore previous RELEASE_SHA in /etc/yubie/production.env, then
docker compose --env-file /etc/yubie/production.env -p yubie-prod \
  -f infrastructure/docker-compose.prod.yml pull
docker compose --env-file /etc/yubie/production.env -p yubie-prod \
  -f infrastructure/docker-compose.prod.yml run --rm migrate   # schema is expand-only; older images tolerate newer schema per migration headers
docker compose --env-file /etc/yubie/production.env -p yubie-prod \
  -f infrastructure/docker-compose.prod.yml up -d --remove-orphans
```
Schema: migrations are expand-only; verify the previous image's compatibility notes before downgrading (no down-migration exists by design).

## R3 — Roll back the web Worker (after cutover)

Vercel static catalog remains deployed and untouched as the fallback origin. To revert `yubiefood.com`: delete the Worker route / restore the prior DNS state captured at cutover (see DEPLOYMENT_EXECUTION.md "cutover snapshot"). The Vercel deployment is never deleted during the release.

## R4 — Caddy route

Remove the `api.yubiefood.com` block appended for this release (it is additive; RetroPick/Zammad blocks untouched) and `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.

## R5 — Admin

`docker compose -p yubie-admin -f infrastructure/docker-compose.admin.yml down` (loopback-only BFF; zero public exposure without the Caddy route, which R4 also removes).

## Never

- `docker compose down -v` on any operational stack (volume deletion).
- Database reset/seed on production.
- Overwriting/`down -v`-ing the Zammad or RetroPick stacks (shared VPS).
- DNS changes without the captured prior state.
