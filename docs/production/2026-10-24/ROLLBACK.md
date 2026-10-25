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

## R2 — API/worker rollback or forward recovery

Use reviewed immutable image digests from the release receipt through
`YUBIE_API_IMAGE` and `YUBIE_WORKER_IMAGE`. Preserve the production environment
file, configured PSP, PostgreSQL volume and callback ingress. Deploy only
`api worker` in project `yubie-prod`; never remove unrelated services.

Admission stays disabled. Confirm schema compatibility before changing images.
Migrations 0023–0025 are additive; they do not authorize an older payment worker:
old workers cannot drain the new payment notification inbox. Keep a compatible
notification/reconciliation worker whenever any payment or notification remains
unresolved. If no compatible rollback image is qualified, restore forward with
a reviewed compatible image. Do not claim backend rollback readiness without
that receipt. Never restore an older database over customer transactions.

## R3 — Cloudflare Worker rollback

The apex and candidate are existing custom domains on `yubie-web-production`.
Preserve both custom domains, DNS and the `ASSETS` binding. Roll back the Worker
with Wrangler to a reviewed compatible version, then check HTML, referenced
JS/CSS, lazy modules, authentication and recovery reads on both hosts.

Baseline observed 2026-10-24: active version
`e6c5a4dc-f3d9-4fdc-b710-97904e680cea`. Both homepages and their loaded assets
passed read-only inspection. This is baseline evidence, not acceptance of every
commerce route. Requalify the chosen version against the deployed API before
using it for rollback. **Do not revert apex DNS to Vercel or delete custom domains.**

## R4 — Shared VPS and ingress

Keep existing Caddy routes, including `api.yubiefood.com`, operational throughout
rollback. This release does not redeploy admin, ERPNext, WhatsApp, Zammad or
RetroPick. A financial incident freezes admission first; it does not remove
webhook ingress or stop reconciliation.

## Never

- `docker compose down -v` on any operational stack (volume deletion).
- Database reset/seed on production.
- Overwriting/`down -v`-ing the Zammad or RetroPick stacks (shared VPS).
- DNS changes without the captured prior state.
