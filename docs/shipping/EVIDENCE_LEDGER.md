# Biteship shipping execution — evidence ledger

One line per capability, updated as evidence lands. Never conflate states.
Verdict values: `PENDING`, `IMPLEMENTED`, `TESTED_MOCK`, `TESTED_PG`,
`TESTED_SANDBOX`, `ACTIVATED_PROVIDER`, `DEPLOYED_DISABLED`, `DEPLOYED_LIVE`,
`PILOT_PASSED`, `LIVE_ENABLED`, `BLOCKED_EXTERNAL`, `BLOCKED_OPERATOR`.

## Phase 0 — baseline (2026-11-01)

| Item | Verdict | Evidence |
|---|---|---|
| Repo main audited (checkout/payment/ops/worker/config/migrations) | DONE | `bc661a9`; ADR-014 source observations confirmed in code |
| Live API health read-only | DONE | `GET https://api.yubiefood.com/healthz` → `{"ok":true,"service":"yubie-api","version":"v1","releaseSha":"d8a660db96f2f781ad0c4eb091be10034dea6ad6"}` (2026-11-01) |
| Live readiness read-only | DONE | `/readyz` → `{"ok":true,"details":{"database":"connected","commerceProvider":"ipaymu"}}` |
| Live backend = `d8a660d` (PR #61), NOT `b238900` as older docs implied | CONFIRMED | healthz releaseSha + `git merge-base --is-ancestor` (d8a660d ancestor of main) |
| Backend diff live→main | EMPTY | `git diff d8a660d..HEAD -- apps/api apps/worker apps/bot packages/` = no changes; main adds only web/docs |
| Live storefront | DEPLOYED_LIVE | CF Worker `94b37f4e-…` from `f38455d` (docs/production/2026-10-31/STOREFRONT_DEPLOY_RECEIPT.md) |
| Biteship API payload shapes pinned | DONE | docs/shipping/BITESHIP_API_NOTES.md (official docs, 2026-11-01) |
| Baseline `npm ci && npm run check` on clean main | PASS | exit 0, 2026-11-01 |
| Biteship account + sandbox token | BLOCKED_EXTERNAL | owner must provision Starter account + API keys |
| Biteship sandbox Delivered+Cancelled evidence | BLOCKED_EXTERNAL | needs account (see BITESHIP_API_NOTES.md §Sandbox) |
| Production token + activation + wallet | BLOCKED_EXTERNAL | owner + Biteship activation process |
| Approved pickup origin / SKU weights / Ppang transit policy | BLOCKED_OPERATOR | owner input required |
| Finance/PKP/tax policy record + pilot budget | BLOCKED_OPERATOR | Finance owner approval required |

## Implementation ledger (2026-11-01)

| Capability | Verdict | Evidence |
|---|---|---|
| Domain shipment state machine | IMPLEMENTED + TESTED_MOCK | domain shipping.test 4/4 (PR #65) |
| Migration 0027 shipping schema | IMPLEMENTED + TESTED_PG | schema constraints 5/5 on ephemeral PG (PR #65) |
| Config SHIPPING_EXECUTION_MODE + provider admission | IMPLEMENTED + TESTED_MOCK | config tests 13/13 (PR #65) |
| ShippingProviderPort | IMPLEMENTED + TESTED_MOCK | PR #66 |
| Biteship adapter (rates/orders/tracking/cancel) | IMPLEMENTED + TESTED_MOCK | contract tests 11/11 vs pinned fixtures (PR #66) |
| Quotes + rates endpoint + checkout pricing | IMPLEMENTED + TESTED_MOCK/PG | application 8/8, repo PG 1/1, api route 2/2 (PR #67) |
| Fulfillment ready→dispatch worker + booking | IMPLEMENTED + TESTED_PG | worker acceptance 3/3 incl. 100 replays → 1 booking (PR #68) |
| Biteship webhook + inbox | IMPLEMENTED + TESTED_PG/MOCK | route gate 1/1 + inbox dedupe in acceptance (PR #68) |
| Server-authorized picked→shipped / delivered→completed | IMPLEMENTED + TESTED_PG | acceptance test 1 (PR #68) |
| Customer tracking + admin shipment visibility | IMPLEMENTED + TESTED_MOCK | tracking gate 1/1; panel behind confirmed payment (PR #69) |
| Onboarding manual + operator checklist | DONE | docs/shipping/BITESHIP_ONBOARDING_MANUAL.md (PR #70) |
| Full implementation merged to main | DONE | main 8634dc5 (PR #65 + consolidated PR #71; 5/5 checks green) 2026-11-01 |
| Issue #73 P0-A atomic pilot quota | IMPLEMENTED + TESTED_POSTGRES | advisory-lock bounded claim; 5 hardening tests (count/budget/concurrency/ambiguous/GREATEST repricing) apps/worker/tests/shipping-hardening.test.mjs |
| Issue #73 P0-B strict SKU dispatch | IMPLEMENTED + TESTED_POSTGRES | dispatchBlockers + held/blocked_reason/audit + operator requeue; partial/missing profile never books; exact item payload asserted |
| Issue #73 P0-C subsidized free shipping | IMPLEMENTED + TESTED_POSTGRES/UNIT | SHIPPING_FREE_SUBSIDY_MAX_IDR lever (unset = old behavior); Rp0 customer charge, merchant_subsidy + provider_booked ledger; TX1 server-side consume; historic orders untouched |
| Issue #73 P1 instant scope | IMPLEMENTED + TESTED_UNIT | instant never offered/purchasable regression; prerequisites documented in onboarding manual |
| Browser E2E delivery-options specs | PENDING | mock-tier additions deferred to post-merge hardening |
| RC artifact publication | BLOCKED_OPERATOR | run 41314287547 waiting on the protected staging-publication approval in GitHub (owner) |
| Production deploy (mode=disabled) | BLOCKED_OPERATOR | controlled-release root bootstrap (OWNER_SETUP) + authorization.json are owner-only by design; live backend verified still d8a660d, ipaymu, db connected (read-only, 2026-11-01) |
| Sandbox acceptance (Delivered+Cancelled) | BLOCKED_EXTERNAL | needs owner Biteship account + sandbox key |
| Production deploy (mode=disabled) | PENDING | via docs/production/2026-10-26/CONTROLLED_RELEASE.md |
| Shadow / sandbox / pilot / enabled | BLOCKED_EXTERNAL | gated in order; owner activation steps in the manual |
