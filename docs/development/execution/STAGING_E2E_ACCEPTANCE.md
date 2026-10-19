# Staging E2E acceptance

Evidence time **2026-10-19T18:26:25Z**. Git HEAD `7167636e6f2994115e2b84bac779359d7d4170c3` on `feat/staging-e2e-ipaymu-sandbox`. The payment, admin, and ERP changes are uncommitted on that HEAD. Staging `COMMERCE_PROVIDER` was not switched.

Deployed API from the M0 probe remains `aa00c53fe543f385eff4237ceeb1a27fdc878fd4` (`GET /healthz` 200, commerce preview). This checkout is not that image. Migration `0011_checkout_intent.sql` was not applied to staging. Local `DATABASE_URL` was unset, so the persistence suite skipped its Postgres cases (13 tests, 1 pass, 12 skipped) earlier in the same session.

## Automated matrix

Command, exit 0, log timestamps `2026-10-19T18:26:01Z`:

```text
npm run test --workspace @yubie/integrations
npm run test --workspace @yubie/application
npm run test --workspace @yubie/api
```

| Case | Result | Evidence |
|---|---|---|
| iPaymu sandbox adapter signs the exact body, refuses a production host, does not retry HTTP 500, refuses a non-sandbox redirect, and cancel returns `accepted: false` | PASS | `packages/integrations/tests/ipaymu.test.mjs`. Integrations suite 38 pass, 0 fail. |
| Callback HMAC is keyed by the VA and fails when the amount changes | PASS | Same file. |
| Config rejects production env and a non-sandbox base URL | PASS | `packages/config/tests/commerce-config.test.mjs`, 47 pass, earlier this session. |
| Same idempotency key after an ambiguous create does not open a second session | PASS | `packages/application/tests/commerce.test.mjs`. |
| A second key for the same authenticated cart reuses the open attempt | PASS | Same file. |
| Stale draft with `ambiguous_create` and no session id does not release stock | PASS | `packages/application/tests/reconcile-payments.test.mjs`. |
| Callback without an authoritative status does not mark paid or release stock | PASS | `packages/application/tests/ipaymu-callback.test.mjs`. |
| Authoritative success consumes once; replay does not consume again | PASS | Same file. Application suite exited 0, including `erp-authority.test.mjs`. |
| HTTP forged signature is 401 and does not call the provider | PASS | `apps/api/tests/api-ipaymu-webhook.test.mjs`. API suite 29 pass, 0 fail. |
| HTTP amount mismatch is 409 | PASS | Same test. |
| HTTP replay of an unchecked callback is `duplicate` | PASS | Same test. |
| Status `UNSETTLED` stays `pending_payment` with stock held | PASS | Same test. Provider raw status stub, not a live transaction check. |
| Authoritative `SUCCEEDED` marks paid once | PASS | Same test. On-hand stayed 8 after a 1-unit reservation from 9. |
| Gateway HTTP 408/409/502/503/504 keeps the browser idempotency key | PASS | `node --test apps/web/tests/proxy-attempt.test.mjs`, 4 pass, earlier this session. |
| Admin BFF deny-by-default, CSRF on writes, no ERP route | PASS | `apps/admin/tests/admin-bff.test.mjs`, 5 pass. |
| ERP shadow read allowlist and write refusal | PASS | `packages/integrations/tests/erpnext-shadow.test.mjs`. |
| Payment static rules | PASS | `node scripts/payment-rule-scan.mjs`. |
| Live iPaymu sandbox create, return, callback, and reconcile | BLOCKED_EXTERNAL | No sandbox secret was injected. The values pasted in chat were not stored or sent. |
| Staging migration 0011 and unique-index race | NOT_RUN | No local or staging database migration in this session. |
| Playwright checkout | NOT_RUN | No browser pass. The web UI change is the idempotency-key helper, covered by the node test above. |
| `ops-staging.yubiefood.com` | NOT_RUN | No DNS or deploy. |
| ERPNext install, backup, and restore | NOT_RUN | No VPS install. |
| Semgrep CLI and Trail of Bits plugin | NOT_RUN | CLI not installed. Plugin install waits for operator permission. See `SECURITY_TOOLCHAIN.md`. |
| Zammad and WhatsApp live staging | BLOCKED_EXTERNAL | Unchanged from the milestone record. Credentials were not available. |

Preview checkout is not a paid order. Xendit remains in the tree. Guest checkout does not share one global principal lock; the browser key is kept across gateway failures, and authenticated retries reuse `userId` plus request hash.

## Rollback

- Commerce: `COMMERCE_PROVIDER=preview`.
- Web Worker: previous version `76ad2992-2bc6-49b5-9b5e-d4c8e1d5bc5c` if `4cfac3b5-2898-4e52-ba55-ddaabd67be72` must be reverted. Keep `workers_dev` and `preview_urls` false.
- Database: forward-only `0011`. Restore from a backup taken before migrate. No volume wipe.
