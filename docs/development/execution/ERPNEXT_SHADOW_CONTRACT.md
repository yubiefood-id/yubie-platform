# ERPNext shadow contract

Recorded **2026-10-19T18:26:25Z**. No ERPNext process was installed. The shared VPS and RetroPick Caddy were not changed.

## Authority

Yubie Postgres remains the writable store for D2C orders, payment sessions, and short-lived lot reservations. `erpStockWriteDecision()` in `packages/application/src/policies/erp-authority.ts` returns `allowed: false` with reason `dual_master_unproven`. `createFirstPartyCheckout` consults that gate and does not import an ERP client.

ERPNext can become the physical stock, batch, warehouse, procurement, manufacturing, and accounting record only after one writable stock owner is proven. Until then checkout does not post Stock Entries, Sales Invoices, or Payment Entries.

## Shadow client

`ErpNextShadowClient` in `packages/integrations/src/erpnext/shadow-client.ts`:

- `read` sends `GET` only, to `https` and a path under `/api/resource/`, on the configured origin.
- Other origins, plain HTTP, and `/api/method/` are refused and do not call the network.
- `write` returns `{ ok: false, code: "refused" }` and does not call the network.
- API token material stays in the server process that constructs the client. The storefront and `apps/admin` do not import this module.

Test: `packages/integrations/tests/erpnext-shadow.test.mjs` and `packages/application/tests/erp-authority.test.mjs`. Both passed in the 2026-10-19T18:26:01Z workspace run.

## Not done

- No Docker Compose service, MariaDB, Redis, or site was added.
- No staging or production credential was loaded.
- Accounting backfill, SKU maps, and restore evidence are operator work after a cost sign-off. See `EXTERNAL_ACTIONS.md`.
