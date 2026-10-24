# Rollback Plan — 2026-10-24 Production Release

Principle: financial callback processing and reconciliation remain available in EVERY rollback state, even when new checkouts are disabled. Never destroy data to roll back code.

## R1 — Disable new payments (any suspicion of money mishandling)

Edit `/etc/yubie/production.env` on the VPS: `COMMERCE_PROVIDER=preview` (or `disabled`), then:
```
docker compose --env-file /etc/yubie/production.env -p yubie-prod \
  -f infrastructure/docker-compose.prod.yml up -d api worker
```
In-flight sessions keep their callbacks: the webhook route stays deployed and the reconciler keeps polling (worker runs regardless of provider mode via pending-payment queries; callbacks for ipaymu mode require the provider context — if provider config is removed entirely, outstanding payments are reconciled from the durable queue once restored; do not delete payment rows).

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
