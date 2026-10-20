# Staging handoff

**2026-10-19T18:26:25Z.** Branch `feat/staging-e2e-ipaymu-sandbox`. HEAD `7167636e6f2994115e2b84bac779359d7d4170c3`. Changes are local and uncommitted. Nothing was pushed. Staging commerce was left on preview.

## Done

- M0 evidence, threat model, iPaymu contract, risk register, and external actions are in `docs/development/execution/`.
- iPaymu sandbox adapter, fail-closed config, checkout intent reuse for an authenticated cart, ambiguous-create handling, stale-draft hold, and the callback route are in the working tree. Xendit is still there.
- Mock payment matrix passed. See `STAGING_E2E_ACCEPTANCE.md`.
- `apps/admin` is an undeployed BFF. Refine `@refinedev/core` 5.0.12 and `@refinedev/react-router` 2.0.4 match React 19 peers and are not installed. Server `authorize()` is the access check.
- ERPNext shadow client and write gate are tested. No server was provisioned.
- `.semgrep/payment.yml` is enforced by `npm run payment:scan`.

## Still blocked

- Live sandbox calls: BLOCKED_EXTERNAL until the operator rotates the exposed key and injects a confirmed sandbox pair outside chat.
- Provider questions (cancel by session, lookup by reference, duplicate reference, SessionID to transactionId) are unanswered. Do not flip `COMMERCE_PROVIDER`.
- Staging API image `aa00c53` is older than this HEAD. Do not migrate `0011` onto that image.
- Access membership, Google client type, and the backup restore drill were not verified in this session.
- Trail of Bits was not installed. Permission, license, and hook review are still required.
- Guest checkout can still start another attempt with a new idempotency key if the browser drops the key. Authenticated retries are bound to user id plus request hash. Gateway statuses 408/409/502/503/504 keep the key.

## Do not commit

The untracked file whose name says an API secret is still registered. It stays out of git. Do not add the pasted iPaymu values or the Google client id.

## Web proxy and Worker URL changes

These were merged in [PR #9](https://github.com/yubiefood-id/yubie-platform/pull/9) (`6a2f451`) and are no longer a local patch. `apps/web/app/api/purchase-options/[slug]/route.ts` proxies through `proxyApi`. `apps/web/wrangler.jsonc` sets `workers_dev` and `preview_urls` to false. The deployed staging Worker has not been confirmed to include them. See `docs/production/readiness/EVIDENCE_LEDGER.md`.

## Rollback

`COMMERCE_PROVIDER=preview`. Keep the Xendit adapter. Worker rollback target from the M0 probe: `76ad2992-2bc6-49b5-9b5e-d4c8e1d5bc5c`. Database rollback is restore from a backup taken before `0011`, not a volume delete.
