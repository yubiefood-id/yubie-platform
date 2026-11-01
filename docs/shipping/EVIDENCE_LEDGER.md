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
| Baseline `npm ci && npm run check` on clean main | PENDING | running 2026-11-01 |
| Biteship account + sandbox token | BLOCKED_EXTERNAL | owner must provision Starter account + API keys |
| Biteship sandbox Delivered+Cancelled evidence | BLOCKED_EXTERNAL | needs account (see BITESHIP_API_NOTES.md §Sandbox) |
| Production token + activation + wallet | BLOCKED_EXTERNAL | owner + Biteship activation process |
| Approved pickup origin / SKU weights / Ppang transit policy | BLOCKED_OPERATOR | owner input required |
| Finance/PKP/tax policy record + pilot budget | BLOCKED_OPERATOR | Finance owner approval required |

## Implementation ledger

| Capability | Verdict | Notes |
|---|---|---|
| Domain shipment state machine | PENDING | PR1 |
| Migration 0027 shipping schema | PENDING | PR1 |
| Config SHIPPING_EXECUTION_MODE + provider admission | PENDING | PR1 |
| ShippingProviderPort | PENDING | PR2 |
| Biteship adapter (rates/orders/tracking/cancel) | PENDING | PR2 |
| Quotes + rates endpoint + checkout pricing | PENDING | PR3 |
| Fulfillment ready→dispatch worker + booking | PENDING | PR4 |
| Biteship webhook + inbox | PENDING | PR4 |
| Customer tracking + finance ledger + admin | PENDING | PR5 |
| E2E + onboarding manual + sandbox harness | PENDING | PR6 |
| Production deploy (mode=disabled) | PENDING | via CONTROLLED_RELEASE runbook |
| Shadow / sandbox / pilot / enabled | PENDING | gated, in order |
