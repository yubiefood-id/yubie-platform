# Risk register — staging E2E and iPaymu

Date **2026-10-19**. Source HEAD `7167636e6f2994115e2b84bac779359d7d4170c3`. Owners are roles, not named people.

| ID | Severity | Risk | Prerequisite | Rollback |
|---|---|---|---|---|
| R1 | High | Running API image is `aa00c53`, not HEAD `7167636`. A later migration deployed only on a new image would not match the web. | Release-candidate workflow for the SHA that contains the payment change. | Keep `RELEASE_SHA` on the last digested image. Do not migrate staging ahead of that image. |
| R2 | High | New Idempotency-Key after HTTP 502/503/504 can open a second checkout while the first provider create is ambiguous. | Server-side one-open-attempt rule plus client key retention. | `COMMERCE_PROVIDER=preview` so no PSP session is created. |
| R3 | High | Stale-draft cleanup releases stock when `providerSessionId` is null, including `ambiguous_create`. | Reconcile change covered by a test that an ambiguous draft is not released. | Stop the payment reconcile worker (it already no-ops unless provider is xendit). |
| R4 | High | iPaymu has no documented cancel-by-session or lookup-by-SessionID. Reporting cancel success would release stock incorrectly. | Adapter returns unsupported. Support answer recorded in `IPAYMU_PROVIDER_CONTRACT.md`. | Do not set `COMMERCE_PROVIDER=ipaymu`. |
| R5 | High | Credentials pasted into chat may be production or sandbox. Using them could move real money or leak a merchant secret. | Operator rotates them and injects confirmed sandbox secrets only. | Never read those values from git; they are not in git. |
| R6 | Medium | Cloudflare Access policy membership was not readable (HTTP 403). An Everyone or Bypass policy would expose staging web. | Operator reads the Access application for `staging.yubiefood.com` and confirms named emails only. | Keep `workers_dev` and preview URLs disabled. They were disabled on the deployed script at audit time. |
| R7 | Medium | Google client type was not re-checked against Google Cloud. A non-web client breaks sign-in. | Operator confirms the Web application client and authorized JavaScript origin for `https://staging.yubiefood.com`. | Leave login fail-closed when `GOOGLE_CLIENT_ID` is empty (API returns `AUTH_NOT_CONFIGURED`). |
| R8 | Medium | Backup restore has not been executed in this session. | Staging `pg_dump` and restore into an empty database, then checksum. | Do not run destructive migrations until that drill passes. |
| R9 | Medium | Callback docs say HTTP 200 stops retries and sample code marks paid after HMAC. A forged or partial body could be acknowledged. | Verify HMAC, merchant, reference, amount, and currency; inbox commit before 200; transaction check once `trx_id` exists. | Reject the webhook route until fixtures pass (do not mount it in preview). |
| R10 | Low | `getApiOrigin()` localhost fallback remains for any caller that still uses it. | Purchase-options patch uses `proxyApi`. Grep remaining callers before the next web deploy. | Redeploy the previous Worker version. |
| R11 | Low | ERPNext and Refine are not in the runtime. A partial install on the shared VPS could disturb RetroPick. | Isolated host and an explicit cost sign-off. Shadow reads only. | Do not add compose services to the shared stack in this change. |

Accepted now: live iPaymu, live Xendit, production DNS edits, and RetroPick Caddy edits are out of scope.
