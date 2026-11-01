# Storefront Deploy Receipt — Mobile Checkout Input Fix (PR #74)

- **Recorded (UTC):** 2026-11-01T16:19:16Z
- **Deployed at (UTC):** ~2026-11-01T16:1x (wrangler upload 15.13s)
- **Source:** PR #74 merge commit `5c0ce121742ad90825d3a52aa941dd8c9b20e4db` (`main`, CI run 41323918259 — 5/5 checks green incl. full-matrix browser job)
- **Worker:** `yubie-web-production` · custom domains `yubiefood.com` + `next.yubiefood.com` preserved · `ASSETS` + `YUBIE_API_ORIGIN` bindings preserved
- **New worker version:** `7e55c23b-e12f-473d-9436-e8b46bee2c88`
- **Rollback version (previous):** `ef14898c-13dc-4ce9-a3a0-edb889ef7d79` (2026-10-31 legal-pages code + post-deploy secret change) — rollback = verified rebuild of prior source + `npx wrangler deploy -c wrangler.prod.jsonc` (ROLLBACK.md §R3)
- **Build:** isolated `git worktree` at the merged SHA (the shared checkout was concurrently switched to another branch by a parallel session; a production artifact must never be built from a contended tree) · `web.release_verified` — releaseSha `5c0ce121…`, artifactDigest `sha256:cc954c2892638018584beefb970c3cba596207fb9a41ca281e4acd020d3c68d5`
- **Authorization:** explicit owner instruction ("push to production, but before that fix this", session 2026-11-01), acting as the separate frontend-release approval per CONTROLLED_RELEASE.

## Incident & root cause (summary; full analysis in PR #74)

Mobile users could not fill the checkout form (desktop worked). Every input sat in fieldsets gated on the admission probe, which permanently resolved "unavailable" on real devices via: missing `navigator.locks` / `AbortSignal.timeout` (Safari/iOS < 16.4), `recover()`/blocked-storage overwriting an enabled admission, or a transient `/api/checkout/session` failure on cellular — and disabled inputs were styled identically to enabled ones. Fix: typing is never gated on admission (only the pay button is), Web Locks/timeout fallbacks added, recovery guarded, inputs 16px (no iOS focus zoom). Payment semantics (quote, totals, idempotency, admission server-side) unchanged.

## Post-deploy verification (executed against https://yubiefood.com)

Mobile viewport 390px + touch, zero page errors:

1. **Incident conditions reproduced and passing**: with `navigator.locks` and `AbortSignal.timeout` deleted (iOS ≤16.3 simulation) — all checkout inputs enabled and fillable (email/phone/address/city accept values).
2. **Healthy path**: `/api/checkout/session` → 200 `ready:true, admission:"enabled"`; quote resolves; "🚚 Gratis ongkir ke Kabupaten Bogor" visible; pay button **ENABLED** ("Bayar Rp…"). No order submitted during verification.
3. **Regression**: `/faq /terms /refund-policy /contact /privacy` all HTTP 200; footer legal links correct; no horizontal overflow at 390px.
4. **Biteship inert as planned** (owner decision 2026-11-01): web-only deploy from main; backend VPS untouched (no migration 0027, no new images, no BITESHIP_*/SHIPPING_* env) — courier options can never appear; free_promotional checkout bit-identical.

## Untouched

Payment configuration, admission env, callbacks, reconciliation, inventory, database, backend images, DNS. Merchant identity remains gated (`verify:merchant-identity` exit 77) — iPaymu submission still awaiting owner identity data.
