# Storefront Deploy Receipt — Maps-First Checkout + Two-Order Sandbox Validation (in flight)

- **Recorded (UTC):** 2026-11-12 ~04:2x
- **Merged:** PR #94 (`672254db` maps-first checkout + saved-address picker + sandbox tooling), PR #98 (`44b44fb` prod worker trusts cf-connecting-ip), PR #99 (probe action-pin fix), PR #100 (probe summary import fix) — all 5/5 CI green.
- **Worker:** `yubie-web-production` · **live version `aa26f371`** (built at 44b44fb, Maps browser key + Map ID baked, `web.release_verified`, digest sha256:d1522456…; debug diagnostic route deployed once (c5d01f1f) and REMOVED — clean redeploy verified 404 on the diagnostic path). Rollback: prior verified version `0eb1f4c9`.
- **Backend (no code deploy):** `MAPS_PROVIDER=google` + `GOOGLE_MAPS_SERVER_KEY` active since 2026-11-11 (mapsAvailable:true); `BITESHIP_WEBHOOK_SECRET` added 2026-11-12 (api+worker recreated; negative 401 + positive 200 + `shipment_provider_inbox` rows verified live); shipping mode remains disabled — no bookings in production.

## Live verification

- Maps-first checkout LIVE: no manual city field; guidance hint present; address-search box present; saved-address picker (account owns CRUD) ships in this build.
- Location endpoints via the worker still 503 LOCATION_UNAVAILABLE — **root cause: the value in GOOGLE_MAPS_SERVER_KEY on the VPS is the BROWSER key** (AIzaSyCLD…v6Y, referrer-restricted; server-side Google calls rejected). Infrastructure verified correct end-to-end: worker flag `WEB_TRUST_CLOUDFLARE_IP=true` live, cf-connecting-ip present, IP header forwarding proven (direct API test passes the gate), `mapsAvailable:true`. OWNER ACTION REQUIRED: create a SERVER API key (Geocoding + Places API New, no referrer restriction) and replace the value in `/etc/yubie/production.env`, then `docker compose -p yubie-prod --env-file /etc/yubie/production.env -f docker-compose.prod.yml up -d --no-deps api`.
- Issue #96 (first-POST interception race): two affected e2e tests quarantined with pointers; full diagnostics in the issue.

## Two-order sandbox validation (in flight — awaiting owner dashboard simulation)

- **Order A (target DELIVERED): `6af53989abacb7761acbdef7`** — booked via probe run 43151710436 (PROBE_OK: 5 rates, 5 pickup-capable, cheapest sicepat reg Rp7.000, status confirmed); verify run 43153522625-1 (43152004538) confirms `confirmed`. NEVER to be cancelled.
- **Order B (target CANCELLED): `6af53d614f0b7383839373b8`** — booked via probe run 43153522625 (GREEN; PROBE_OK identical shape, waybill WYB-1794456929965).
- Pending: owner simulates A→delivered and B→cancelled in the Biteship dashboard (and configures the sandbox webhook URL+header), then verification + SANDBOX_PASS gate + EVIDENCE_LEDGER rows complete the validation.
