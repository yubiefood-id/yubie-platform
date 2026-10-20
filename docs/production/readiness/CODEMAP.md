# Checkout code map

Where each part of the first-party money path lives on `6a2f451`.

| Concern | Location |
|---|---|
| HTTP checkout boundary, session user, idempotency header | `apps/api/src/index.ts` (`POST /v1/checkouts`, `GET /v1/checkouts/:token`) |
| iPaymu callback route | `apps/api/src/index.ts` (`POST /v1/webhooks/ipaymu`) |
| Composition and provider selection | `apps/api/src/composition/create-app.ts`, `packages/integrations/src/payments/create-commerce-payment-provider.ts` |
| Checkout saga (TX1 claim, provider create, TX2 attach) | `packages/application/src/use-cases/first-party-checkout.ts` |
| Callback processing (verify, inbox, authoritative check, locked transition) | `packages/application/src/use-cases/process-ipaymu-callback.ts` |
| Reconciliation sweep | `packages/application/src/use-cases/reconcile-payments.ts`, `apps/worker/src/payment-reconcile-handler.ts` |
| ERP write gate | `packages/application/src/policies/erp-authority.ts` |
| Ports | `packages/application/src/ports.ts` |
| Order totals, promotions | `packages/domain/src/orders.ts`, `packages/domain/src/promotions.ts` |
| iPaymu adapter and signatures | `packages/integrations/src/ipaymu/` |
| Xendit adapter | `packages/integrations/src/xendit/xendit-payment-provider.ts` |
| Order and payment repositories | `packages/persistence/src/repositories/order-repository.ts` |
| Schema and migrations | `packages/persistence/src/schema/index.ts`, `packages/persistence/migrations/0007_orders.sql` to `0011_checkout_intent.sql` |
| Web checkout UI and attempt keys | `apps/web/components/checkout/checkout-view.tsx`, `apps/web/lib/proxy-headers.ts` |
| Web to API proxy | `apps/web/app/api/` route adapters through `proxyApi` |
| Payment static rules | `.semgrep/payment.yml`, `scripts/payment-rule-scan.mjs` (`npm run payment:scan`) |
| Admin BFF (not deployed, no real data) | `apps/admin/src/` |
| CI | `.github/workflows/ci.yml` (quality, persistence on Postgres 17, containers) |
