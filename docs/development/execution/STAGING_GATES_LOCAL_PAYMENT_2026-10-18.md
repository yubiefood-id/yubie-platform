# Yubie staging unblock: Indonesian payment gateway, operators and go/no-go gates

Audit snapshot: **2026-10-18**. Source: `main@3a06b46dea980880f62e13660937172c0671698b`.
Superseded for live status by `STAGING_E2E_MASTER_PLAN.md` and `STAGING_BASELINE_EVIDENCE.md` (2026-10-19, HEAD `7167636`). This file stays the decision record.
**This is an execution plan, not proof of live staging.** No account secrets, DNS, gateway transaction, Zammad ticket or WhatsApp message were validated in this documentation change.

## Verified software baseline

- GitHub main CI at `3a06b46`: successful. The last visible release-candidate workflow was successful on `aa00c53`, **not** on current main; image publication/digests for a chosen SHA must be confirmed before deploying.
- Postgres 17 migrations `0001`–`0010`, `apps/api`, `apps/worker`, `apps/bot`, Xendit integration, lot reservations, FEFO, webhook deduplication and reconciliation exist in source.
- `COMMERCE_PROVIDER` currently accepts only `preview`, `xendit`, `disabled`. No iPaymu/Duitku adapter or gateway-specific webhook is implemented. `COMMERCE_PROVIDER=ipaymu` **will fail validation** today.
- `apps/web/wrangler.jsonc` and `docs/development/STAGING_WEB_DEPLOY.md` prescribe Cloudflare/Vinext staging. A Vercel READY preview does not prove the staging API or payment gateway is live.
- `docs/development/execution/PRE_STAGING_ENGINEERING_ACCEPTANCE.md` reports **PRE_STAGING_ENGINEERING_READY**, but explicitly marks Xendit, Google, Zammad, WhatsApp, DNS/TLS as external blockers. Re-verify live environment before changing status.

## Decision: local provider without false claims of immediate live availability

**Approved first integration: iPaymu Redirect Payment in SANDBOX** (hosted checkout, IDR, available wallet/QRIS/VA channels). Official docs: https://docs.ipaymu.com/id/docs/payment/redirect-payment ; signup: https://sandbox.ipaymu.com/register . Sandbox merchant credentials are issued separately from production credentials; never mistake signup for live-money activation.

**Fallback:** Xendit adapter stays in code and is not removed; use Xendit only after merchant KYC/docs are available. Duitku POP sandbox is a secondary evaluated alternative: https://docs.duitku.com/pop/id/ . Do not add multiple new adapters in the same milestone.

**Commercial constraint:** live merchant payment activation is subject to iPaymu KYC/verification (KTP, selfie KTP, verified merchant bank account, public website, required terms/privacy/refunds policy), and may need production IP/domain registration, even when sandbox can be tested. An existing static GoPay Merchant QRIS (if verified) can serve only a *separately labelled, human-reviewed manual-payment fallback*; it is not an API payment session with authoritative order-specific webhook and must not auto-confirm paid orders.

**Until adapter exists:** use `COMMERCE_PROVIDER=preview` for infra smoke; this is not live checkout. Do not replace Xendit placeholder credentials with iPaymu secrets.

## Environment variable owner map

| Key(s) | Approved source / value | Owner | Gate |
|---|---|---|---|
| `RELEASE_SHA` | Full 40-character approved GHCR artifact SHA (digests verified) | DevOps | Immutable image available |
| `YUBIE_ENV` | `staging` | DevOps | Fail-closed startup |
| `POSTGRES_USER`, `POSTGRES_DB` | staging-only Postgres role/db | DevOps | Dedicated staging data |
| `POSTGRES_PASSWORD`, `DATABASE_URL` | generated secret / internal `postgres:5432` DSN | DevOps | Secret store, migrations + restore |
| `APP_ORIGIN` | `https://staging.yubiefood.com` | DNS/web owner | HTTPS and return URLs work |
| `COMMERCE_PROVIDER` | `preview` **now**; `ipaymu` only after implemented | Engineering | Config + gateway sandbox matrix |
| `INVENTORY_MODE` | `lots` | Ops/engineering | Released synthetic lots, no oversell |
| `PURCHASE_OPTIONS_SOURCE` | `database` | Engineering | Postgres listed offerings |
| `SHIPPING_POLICY` | Currently `free_promotional`; confirm cost approval before live | CEO/operations | No unapproved free-shipping losses |
| `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_BUSINESS_ID`, `XENDIT_API_BASE_URL` | empty/inactive in preview or eventual iPaymu mode; Xendit deferred | Finance/operator | Never re-used as iPaymu fields |
| `GOOGLE_CLIENT_ID` | Google OAuth web app client ID, authorized staging origin | Google Cloud owner | Real sign-in smoke |
| `API_PROXY_TOKEN` | generated shared hop token in API secret + Wrangler **secret** | DevOps | API 401 invalid; 200 valid |
| `OPS_API_TOKEN` | generated ops token, server-side only | DevOps | Protected /ops routes |
| `SUPPORT_PROVIDER` | `zammad` after real staging provisioning | Customer ops | Provider not fake |
| `BOT_ENGINE` | `deterministic` | Engineering | No LLM-critical-path dependency |
| `WORKER_METRICS_ENABLED` | `true` | DevOps | Metrics accessible internally |
| `ZAMMAD_BASE_URL`, `ZAMMAD_API_TOKEN` | real staging instance URL and service account token | Zammad owner | API reachability |
| `ZAMMAD_WHATSAPP_ARTICLE_TYPE`, `ZAMMAD_GROUP_BOT_QUEUE`, `ZAMMAD_GROUP_CUSTOMER_SUPPORT`, `ZAMMAD_GROUP_SALES_PARTNERSHIP`, `ZAMMAD_GROUP_FOOD_SAFETY`, `ZAMMAD_PRIORITY_HIGH` | Discover from **real** Zammad instance; fixture IDs prohibited | Zammad owner | Provision + read-back |
| `ZAMMAD_WEBHOOK_SECRET`, `ZAMMAD_WEBHOOK_BEARER` | unique verifier credentials for bot webhook | Zammad/DevOps | Unauthorized 401/403, authorized roundtrip |
| `CHATWOOT_AGENTBOT_SECRET` | empty under Zammad; retained for documented rollback only | DevOps | Never simultaneous bot authority |

**Proposed adapter environment (not yet valid):**
```dotenv
# Design only; do not paste into production until implementation + tests.
COMMERCE_PROVIDER=ipaymu
IPAYMU_ENV=sandbox
IPAYMU_VA=
IPAYMU_API_KEY=
IPAYMU_API_BASE_URL=https://sandbox.ipaymu.com
# Callback route is a future integration requirement, not yet implemented:
IPAYMU_NOTIFY_URL=https://api-staging.yubiefood.com/v1/webhooks/ipaymu
```
Keep `IPAYMU_VA` and `IPAYMU_API_KEY` server-side and in distinct secret-scoped API/worker runtime environments. iPaymu API v2 requires request signatures using HMAC-SHA256 of method, VA, JSON body hash and API key. The frontend must never sign calls. Extend `apps/web/scripts/validate-artifact.sh` to reject `IPAYMU_API_KEY`, `IPAYMU_VA` and other server-only credentials (currently scans Xendit but not iPaymu).

## Parallel workstreams / hard acceptance

| Lane | Deliverable | Evidence needed before PASS | Owner |
|---|---|---|---|
| Backend | VPS Caddy HTTPS → API/worker/bot from approved GHCR SHA | `/healthz`, `/readyz`, proxy authorization, image digest | DevOps |
| Database | PG17 migrated & synthetic lot seed | 0001-0010 migration, query checks, **restore** drill | DevOps/DB |
| ERP | ERPNext isolated pilot, SKU/lot mapping, no double-write | item mapping, reconcile report, QA quarantine/recall read | Operations |
| Image | Product SKU artwork audit | 200 assets, responsive/CLS checks, no prototype sold as approved SKU | Brand/web |
| Payment | iPaymu sandbox hosted redirect behind `PaymentProviderPort` | success/pending/expire/refund, duplicate/forged/out-of-order callbacks, amount/reference/merchant check, ambiguity reconciliation; cancellation and SessionID lookup contract require separate provider confirmation | Engineering/Finance |
| Zammad | isolated staging instance + routing | API token, real IDs, inbound ticket, handoff and agent reply | Support/DevOps |
| WhatsApp | official Meta WhatsApp Cloud API test number connected to Zammad | inbound/outbound, opt-in/template where applicable, human takeover, food-safety escalation | Support/Meta |

Existing inventory behavior: avoid directly decrementing stock on browser return. Provider-status verification is the only payment-to-order authority. Capture evidence without publishing real customer data.

## Phase sequence and operator commands

1. **Freeze release**: compare latest `main` CI and target SHA. Dispatch `.github/workflows/release-candidate.yml` for that exact approved SHA; verify GHCR tag **and digest** before changing `RELEASE_SHA`.
2. **Provision infrastructure**: DNS/TLS for `staging.yubiefood.com`, `api-staging.yubiefood.com`, `bot-staging.yubiefood.com` and `support-staging.yubiefood.com` as applicable; separate staging Postgres and Zammad storage. Keep all data services off public ports.
3. **Deploy DB + API** with safe `COMMERCE_PROVIDER=preview` first. Do not claim transactions are enabled. On the staging host, after filling `/etc/yubie/staging.env` with restricted permissions:
```bash
# Working directory: Yubie repository root; this is NOT executed by this document.
set -a; . /etc/yubie/staging.env; set +a
npm run config:validate
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml config --quiet
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml pull
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml run --rm migrate
# Only when all service-specific configs and provider identities are real:
docker compose --env-file /etc/yubie/staging.env -f infrastructure/docker-compose.prod.yml up -d --remove-orphans
```
Avoid dumping `docker compose config`, shell environment, or application tokens to shared logs; `--quiet` avoids printing secrets.

If only the API/database is being commissioned and Zammad is not provisioned, first run the **API-only** validator (`npm run build --workspace @yubie/config && node scripts/validate-runtime-config.mjs --service api`). Do not mark worker/bot ready and do not use `up -d --remove-orphans` for the full stack until their external Zammad configuration is valid. Compose's `api` service can be brought up independently after its postgres + successful migration prerequisites are met.
4. **Add iPaymu** in a separate reviewed code PR: `packages/domain/src/orders.ts`, `packages/config/src/index.ts`, `packages/integrations/src/ipaymu`, API composition + authenticated callback endpoint, worker reconciliation, Compose variable scopes, client-artifact secret scanner, unit/integration tests, and a new/superseding payment ADR. Keep the existing Xendit adapter fully intact. No production switch until sandbox evidence.
5. **Zammad then WhatsApp**: follow `infrastructure/zammad/README.md`, `npm run zammad:provision`, `docs/development/execution/M5_D_RC_LIVE_STAGING_PLAYBOOK.md`. Zammad requires **WhatsApp Cloud API**, not a WhatsApp Business mobile-app login.
6. **Web staging**: follow `docs/development/STAGING_WEB_DEPLOY.md` (Cloudflare/Vinext); `API_PROXY_TOKEN` is a Wrangler **secret** and must match API. Vercel remains preview.
7. **ERP shadow pilot**: `docs/development/phases/PHASE_M7_ERP_BACKOFFICE.md` defines ERPNext as candidate physical-stock/QA authority. Do not make ERP and Yubie both writable inventory masters until sync rules and financial controls are approved.

## Go/no-go

- **Engineering checked in source/CI:** existing Xendit-path code, migration/lot logic, release workflow, Zammad connector.
- **Live staging:** **NOT VERIFIED**, until independent DNS/TLS, real provider tests, cross-service metrics, data restore and security evidence exist.
- **Live payments:** **NO-GO** until actual provider account is approved, tests pass, tax/legal/fulfilment owner signs off.
- **Commerce rollback:** keep marketplace and WhatsApp purchase routes, and revert provider to `preview` only as a clearly non-paying experience; never represent it as accepting real payments.
- **Support rollback:** Chatwoot only under explicit single-authority cutover runbook.

## Operator decisions (no credentials in GitHub)

- Confirm actual deadline and accountable approvers.
- Confirm legal recipient of funds (merchant individual or business), merchant bank account, product sale/regulatory approvals and shipping-charge policy.
- Create an iPaymu **sandbox** account; report only the **presence** of credentials, never their values.
- Confirm DNS/Cloudflare access and which VPS hosts core services and Zammad.
- Confirm Meta WhatsApp Business Account admin/system-user access and approved staging test number.
- Record a gate ledger with timestamps, git SHA, test evidence, PASS/FAIL/BLOCKED_EXTERNAL and rollback owners. No gate passes by inference from a local mock.

## iPaymu-specific payment verification safety (2026-10-18 addendum)

Verified official documentation:

- Redirect: `POST https://sandbox.ipaymu.com/api/v2/payment` with arrays `product`, `qty`, `price`, `description`, and `returnUrl`, `notifyUrl`, `cancelUrl`, `referenceId`; response `Data.SessionID` and `Data.Url`. Source: https://docs.ipaymu.com/id/docs/payment/redirect-payment .
- Request signature: SHA256 of exact JSON request body, then HMAC-SHA256 of `POST:VA:bodySha256:apiKey`, key `apiKey`; headers `va`, `signature`, `timestamp`. Source: https://docs.ipaymu.com/id/docs/signature .
- Callback: dashboard can choose form-encoded (default) or JSON. Verify `X-Signature` using provider-documented normalization, sorted payload keys and **merchant VA as callback signing secret**, with timing-safe equality. The callback key is NOT interchangeable with API request signing key. Verify merchant, reference, and amount; then independently confirm payment using transaction check API before changing order state. Source: https://docs.ipaymu.com/id/docs/callback .
- Transaction status: `POST /api/v2/transaction` requires `transactionId`; status 0 pending, 1 succeeded, 6 succeeded-not-settled, 2 cancelled, 3 refund, 4 error, 5 failed, -2 expired. Source: https://docs.ipaymu.com/id/docs/transaction/check-transaction .
- **Unresolved provider contract blockers:** Redirect response only documents `SessionID`, but transaction lookup requires `transactionId`; verify mapping and any supported cancel-by-session endpoint with iPaymu before enabling automated release/cancellation. Existing Yubie payment saga calls `cancelPaymentSession()` on attach failure and worker recovery; never assume cancel succeeded. Explicitly hold for operator reconciliation until resolved.
- Do not add these proposed env fields to live compose until implementation and tests are green; source currently recognizes only `preview`, `xendit`, `disabled`.
