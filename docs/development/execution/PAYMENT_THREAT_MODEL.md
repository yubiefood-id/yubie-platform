# Payment threat model

Audit date **2026-10-19**. Source HEAD `7167636e6f2994115e2b84bac779359d7d4170c3`. Staging commerce is `preview` (`/readyz`). This is a code-path model, not a penetration test and not a claim that money can or cannot be lost.

## Trust boundaries

```text
Browser cart (untrusted prices)
  -> apps/web CheckoutView + same-origin /api/checkout
  -> apps/api POST /v1/checkouts (API_PROXY_TOKEN hop)
  -> TX1 draft + reservation + idempotency claim
  -> PaymentProviderPort (Xendit today; iPaymu not implemented)
  -> TX2 attach session
  -> webhook POST /v1/webhooks/xendit/payment-session
  -> worker reconcilePayments
```

Cloudflare Access protects the staging **web** hostname. It is not the API trust gate and it is not Google login. Google login is `POST /v1/auth/google` with an ID token verified by `GoogleIdTokenVerifier` when `GOOGLE_CLIENT_ID` is set (`apps/api/src/composition/create-app.ts`). Access policy membership was not readable in this audit (`STAGING_BASELINE_EVIDENCE.md`).

The public API is reachable through Caddy. `GET /v1/products/yubie-shake/purchase-options` without the proxy token returned 401 on 2026-10-19. Webhook authentication is separate from that hop: Xendit uses `x-callback-token` plus business id (`apps/api/src/index.ts` around the payment-session webhook).

## Money entry points

| Path | File | What it trusts |
|---|---|---|
| Checkout create | `apps/api/src/index.ts` `POST /v1/checkouts` | Server re-prices from the catalog when `paymentMode === "xendit"`. Preview mode still builds lines from the catalog, not from client prices. |
| Idempotency | `packages/persistence/migrations/0001_initial.sql` `idempotency_keys` unique on scope, principal, operation, key | Same key replays the stored response. A different key is a new attempt. |
| Provider create | `packages/application/src/use-cases/first-party-checkout.ts` | Hardcodes `provider: "xendit"` on the payment intent. Calls `createPaymentSession` outside the database transaction. |
| Webhook | `packages/application/src/use-cases/process-payment-webhook.ts` | Xendit token and business id. Browser return is not payment authority. |
| Reconcile | `packages/application/src/use-cases/reconcile-payments.ts` | Polls `getPaymentSession`. Stale drafts older than 15 minutes with **no** session id are cancelled and `releaseForOrder` runs. |
| Worker | `apps/worker/src/payment-reconcile-handler.ts` | Returns immediately unless `COMMERCE_PROVIDER=xendit` and `XENDIT_SECRET_KEY` is set. |
| Redirect | `apps/web/components/checkout/checkout-view.tsx` | Assigns `window.location` to `data.redirectUrl` from the API response. The API must keep that URL on the provider host allowlist. |

`apps/web/lib/api-origin.ts` falls back to `http://localhost:8787` when `YUBIE_API_ORIGIN` is unset. The uncommitted purchase-options route no longer uses that helper; other callers can still hit localhost if the binding is missing.

## Idempotency and ambiguous create

`nextAttemptKey` in `apps/web/lib/proxy-headers.ts` keeps the key only when the fetch throws. `CheckoutView` (`checkout-view.tsx` lines 89–91) treats every HTTP response, including 502, 503, and 504, as definitive and clears the key. The next click therefore sends a new key.

Server behavior for the **same** key after an ambiguous provider timeout is already fail-closed in tests: the claim stays open and the replay returns `conflict` without a second `createPaymentSession` (`packages/application/tests/commerce.test.mjs`). The error string in `first-party-checkout.ts` still tells the caller to retry with a **new** Idempotency-Key. A new key is not deduplicated against the unresolved request hash. That is a second-payable-attempt hazard. It is reproduced by reading the control flow; it was not executed against a live PSP.

Ambiguous creates set `reconciliationState` to `ambiguous_create` and leave `providerSessionId` null (`first-party-checkout.ts`). `reconcile-payments.ts` classifies a draft with no session id as `no_session` and then cancels it and releases stock after the stale window, without reading `ambiguous_create`. A provider session that was created but whose response was lost can still be payable while local stock is released. Cancel-on-attach-failure only runs when a session id was stored.

## Webhook and confirmation

Paid state must come from an authenticated provider signal plus amount, currency, merchant, and reference checks against the database. A hosted-page return URL is not confirmation. iPaymu callback docs (fetched 2026-10-19) tell integrators to answer HTTP 200 to stop retries and show sample code that marks an order paid after signature match. Yubie must not copy that step: signature failure stays a rejection, and a valid callback is stored in the inbox before any success acknowledgement. See `IPAYMU_PROVIDER_CONTRACT.md`.

## Redirect, SSRF, and logging

Provider adapters must allowlist the official sandbox host and reject other redirect hosts before the browser is sent there. Checkout must not accept an arbitrary client `successUrl` as the provider return target; the API builds return URLs from `APP_ORIGIN`.

Checkout logs record `requestId`, `checkoutRef`, amount, currency, and mode (`api.checkout_created`). They must not record VA, API keys, raw webhook bodies, or phone numbers. The existing Xendit path logs error codes, not secrets. iPaymu signing material stays in the API and worker processes only.

## Inventory

Lot reservation is inside TX1. Definitive provider 4xx releases stock. Ambiguous timeout keeps the reservation. The stale-draft `no_session` branch can still release that reservation later. iPaymu `cancelPaymentSession` is not a documented operation; a port implementation must not report `accepted: true` for an unsupported cancel, or the attach-failed path will release stock on a guess.

## Out of scope for this model

Live card testing, production merchant KYC, ERPNext ledger posts, and admin UI authorization. Those stay closed until their own gates pass.
