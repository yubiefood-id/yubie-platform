# Storefront Deploy Receipt — Legal & Merchant-Verification Pages

- **Recorded (UTC):** 2026-10-31T10:30:12Z
- **Deployed at (UTC):** ~2026-10-31T10:2x (wrangler upload 24.38s)
- **Source:** PR #62 merge commit `f38455d5402ab752d6393fb6c8762d3bb9ec7a06` (`main`, CI run 41189081453 all-green)
- **Worker:** `yubie-web-production` · custom domains `yubiefood.com` + `next.yubiefood.com` preserved · `ASSETS` + `YUBIE_API_ORIGIN` bindings preserved
- **New worker version:** `94b37f4e-abe5-4b58-932b-7aaa824e39d8`
- **Rollback version (previous):** `0fbaef16-7dca-4ce6-b0be-d0ec7a126845` (deployed 2026-10-24) — rollback = `npx wrangler deploy -c wrangler.prod.jsonc` from a verified build of the prior source (ROLLBACK.md §R3; no DNS/domain changes)
- **Build identity:** `web.release_verified` — releaseSha `f38455d540ab752d6393fb6c8762d3bb9ec7a06`, artifactDigest `sha256:0e24d6c6a42d9dfecfd9aa3ad641aa5e84b680e62e2c69bce19591ca5375c099` (authoritative value printed by `apps/web/scripts/verify-release.mjs`)
- **Authorization:** explicit owner instruction ("push to production yubiefood.com", session 2026-10-31), acting as the separate frontend-release approval required by CONTROLLED_RELEASE.

## Merchant identity gate (truthful state)

`npm run verify:merchant-identity --workspace @yubie/web` → **exit 77** at deploy time: legal operator name, entity type, registered address, support phone, and support hours are still unverified/null. Deployed pages render the verified subset only (email, region, socials) with **no placeholders**. Consequence: **IPAYMU-READY = NO** — do not submit the iPaymu verification form until the identity commit lands (gate → exit 0) and §6 of `IPAYMU_MERCHANT_VERIFICATION_PACKAGE.md` re-verifies.

## Post-deploy verification (executed against https://yubiefood.com)

HTTP (all PASS, 200): `/faq`, `/terms`, `/refund-policy`, `/contact`, `/privacy` — each with correct `<title> · Yubie` and canonical `https://yubiefood.com/<route>`; route-specific content markers (FAQ iPaymu + anchors; Terms version/effective-date/BPSK/PP 80-2019; Refund `[REFUND YUBIE] - Nomor Pesanan`/Pasal 69/timelines; Contact mailto/region/socials; Privacy UU 27/2022/iPaymu). Footer legal links present on every page; sitemap.xml contains all five routes; robots.txt does not disallow them.

Browser (Chromium 390px, zero page errors): `/contact` h1 + visible mailto; footer Bantuan links resolve to `/faq /contact /terms /refund-policy /privacy`; checkout step 3 shows the consent sentence with links to `/terms`, `/privacy`, `/refund-policy`; no horizontal overflow at 390px.

## Untouched (verified)

No changes to payment configuration, admission, callbacks, reconciliation, inventory, shipping approvals, secrets, DNS, or the production API. Live commerce continues on the previously deployed backend.
