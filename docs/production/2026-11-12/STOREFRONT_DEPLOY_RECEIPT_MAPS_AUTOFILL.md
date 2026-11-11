# Storefront Deploy Receipt — Maps Full-Autofill UX (PR #90)

- **Recorded (UTC):** 2026-11-12 ~17:4x
- **Source:** PR #90 merge `a77140dba0a0d4d636dd1068888a1047ca79a711` (`main`; CI 5/5 green after a GitHub-runner DNS outage delayed the containers/persistence/browser jobs ~1 day — same apt-mirror failure class as PR #55, resolved by platform recovery + `gh run rerun --failed`)
- **Worker:** `yubie-web-production` · new version `e49d1b29-10d8-4423-b452-43da1a110eeb` · both custom domains + ASSETS preserved · rollback = verified rebuild+redeploy of prior source
- **Build:** isolated worktree · `web.release_verified` · digest `sha256:7dc2b5756fa929177395a90ce667a47529b1b39854b72e8f4f1be33174aac113`
- **Includes:** address search (Places autocomplete→details), canonical city fill + "Kota lain…" retention for uncovered cities, logged-in name/WA prefill (fill-empty-only), and the react 19.2.9 bump for CVE-2026-126187 (critical RCE in react-server-dom-webpack 19.2.8, caught by the Trivy gate).

## Live verification (https://yubiefood.com, 390px + touch, 0 console errors)

1. "Cari alamat pengiriman" input live; typing a query ends in the honest inactive-service message (autocomplete 503 — Google server key not yet configured).
2. GPS button live: fake-geolocation probe → `503 POST /api/locations/reverse-geocode` → note "Lokasi belum dapat dikenali. Isi alamat manual tetap bisa." — graceful, form stays fillable.
3. City dropdown + free-ongkir hint (incl. new "Kota lain…" wording) live; manual fill → pay button ENABLED.
4. /faq /terms /refund-policy /contact /privacy /checkout all 200.

## State (honest)

- UX code: **DEPLOYED & USABLE** (dropdown, prefill login, manual entry — no Google keys needed).
- GPS auto-fill, address search, map pin: **DORMANT until the owner activates Google keys** per `docs/production/2026-11-11/MAPS_ACTIVATION_GUIDE.md` (server key pair on the VPS API; browser key + Map ID into the web build). No fabricated credentials; every gate fail-closed.
