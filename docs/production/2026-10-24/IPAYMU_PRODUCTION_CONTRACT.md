# iPaymu Production Contract — implemented behavior (2026-10-24)

Source of truth: `packages/integrations/src/ipaymu/*`, `packages/integrations/src/payments/create-commerce-payment-provider.ts`, `packages/config/src/index.ts`, `apps/api/src/index.ts`. Official docs (fetched 2026-10-19): docs.ipaymu.com/id/docs.

## Environment selection (fail-closed, four layers)

| Layer | Rule |
|---|---|
| Adapter constructor | `env` option binds the API origin: sandbox ⇒ exact `https://sandbox.ipaymu.com`; production ⇒ exact `https://my.ipaymu.com`. Any deviation (host spoof, port, http, embedded credentials, path) throws. |
| Redirect allowlist | Provider-returned session `Url` must sit on the https host of the SAME env (path/query open — provider-generated). Cross-env redirects are refused (`unavailable`, retryable-safe). |
| Provider factory | `IPAYMU_ENV` must be exactly `sandbox` or `production` + all four credentials; production additionally requires `YUBIE_ENV=production`; else returns `null` (no provider ⇒ preview). |
| Config validation | Same rules at startup; `INVENTORY_MODE=lots` + `DATABASE_URL` + https `APP_ORIGIN` + public-https `IPAYMU_NOTIFY_URL` required in deployment envs. |

CI enforcement: `scripts/payment-rule-scan.mjs` + `.semgrep/payment.yml` ban production host/env literals everywhere except three reviewed allowlist files.

## Wire contract

- **Create**: `POST {origin}/api/v2/payment`; headers `va`, `signature`, `timestamp` (UTC `YYYYMMDDHHmmss`), `content-type: application/json`. Signature = HMAC-SHA256 over `METHOD:VA:SHA256(body):APIKEY` keyed by the API key, over the exact bytes sent. One POST, no auto-retry; 5xx/408/409/429 ⇒ ambiguous (`timeout`/`unavailable`, retryable), other non-2xx ⇒ `validation`. Response must carry `Data.SessionID` + allowlisted `Data.Url`.
- **Amounts**: server-quoted integer IDR only; aggregate iPaymu line must equal the stored grand total exactly (shipping + discount folded per Commerce V3 invariants); the browser is never payment authority.
- **Status**: `POST {origin}/api/v2/transaction` with numeric `transactionId` only (SessionID lookup is not documented ⇒ `unsupported`). Status map: 1 SUCCEEDED, 2 CANCELLED, 3 REFUNDED, 4/5 FAILED, −2 EXPIRED, 6 UNSETTLED (non-terminal), else PENDING.
- **Cancel**: not documented for redirect sessions ⇒ adapter returns `accepted: false`; stock is never released on that result.
- **Callback** (`POST /v1/webhooks/ipaymu`): JSON or form body ≤256KB; `x-signature` = HMAC-SHA256 keyed by the **merchant VA** (≠ request API key) over the normalized field set (integers cast, `is_escrow` boolean, `additional_info` default `[]`, keys sorted, `/` escaped); constant-time compare; 401 on mismatch with zero side effects. `trx_id` present ⇒ authoritative transaction lookup before any state change. Merchant/amount/currency/session/authoritative-reference mismatches are rejected (409) without touching orders. Durable inbox dedupe key includes the authoritative outcome; HTTP 200 only after the DB transaction commits. Late success after a terminal state ⇒ durable payment exception, never a resurrection; duplicate success ⇒ `multiple_successful_transactions` exception.
- **Browser return URLs** (`/checkout/success`) never mark anything paid.

## Open provider questions (BLOCKED_EXTERNAL — written answers required, see OPERATOR_BLOCKERS B8)

1. Cancel a redirect session by SessionID.
2. Single-transaction lookup by referenceId or SessionID.
3. referenceId reuse while a session is outstanding.
4. Discovering the transactionId when create times out after provider acceptance.
5. Callback `X-Timestamp` authentication and permitted clock skew.
6. JSON callbacks: identical normalization to form callbacks?

Until answered: ambiguous creates park in `pending_reconciliation` (stock held, no second payable session, reconciler retries with DLQ).

## Refunds (B11)

No refund/cancel API is implemented or invented. Refunds are a manual merchant-dashboard procedure owned by Finance (dual approval where applicable, provider reference recorded, audit trail, customer notification) until iPaymu confirms an API contract in writing.

## Money-state invariants (test-proven; see persistence/application suites)

One unresolved payable session per logical checkout intent; concurrent submits converge to one order/intent/session; reservations consume exactly once (FEFO lots); ambiguous outcomes never auto-release stock; worker reconciliation runs even with new checkouts disabled; all of this independent of the WhatsApp bot (bot-off regression tests).
