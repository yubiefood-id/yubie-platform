# Admin BFF design

Recorded 2026-10-20 after main `84b6603`. **Not deployed.** `ops-staging` stays off until DNS and Cloudflare Access are approved.

## What exists

`apps/admin` is a server BFF. `authorize()` denies every method except GET and HEAD, and it denies unknown paths. A customer `yubie_session` cookie is not an admin session. Writes require a CSRF match and still return 403.

`GET /v1/orders` and `GET /v1/payments` accept `limit` (1–50, default 20) and an opaque `cursor` of `[A-Za-z0-9_-]{1,80}`. With no reader configured the body says `source: "unconfigured"`. A configured reader is the only path that returns rows. Rows are id, status, amount, and currency. They do not include email.

Refine stays uninstalled. The pin remains `@refinedev/core` 5.0.12 and `@refinedev/react-router` 2.0.4. The UI, when added, calls this BFF. It does not receive a database URL or an ERP token.

## Postgres readers

`PostgresAdminReaders` (`packages/persistence`) implements the BFF reader interface. Each query runs in a `READ ONLY` transaction with `statement_timeout = 5s`, uses bound parameters, orders by `created_at DESC, id DESC`, and pages with a `<created_at microseconds>_<id>` cursor. A malformed cursor throws, so the BFF returns 503 instead of an empty page. Order rows return the charged grand total; no row carries email, name, or delivery data. Proven against PostgreSQL by `packages/persistence/tests/admin-readers.test.mjs`. Wiring the readers into a running admin process waits on the items below.

## Next implementation

1. Staff OIDC: Google issuer and audience checked on the server, allowlist of staff subjects, role stored server-side. Cloudflare Access is an extra gate, not the authorization decision.
2. Audit row on every read of payments and every denied write: actor, path, time, correlation id. No secret values.
3. Pages, in order: orders, payments, reconciliation queue, inventory lots. Refund and price change stay denied until a second staff approval exists.

## Still blocked

OIDC client, Access policy, and the `ops-staging` hostname are BLOCKED_EXTERNAL.
