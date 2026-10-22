# Test and acceptance evidence

Engineering fixtures never establish live channel delivery. All local database
tests use a disposable synthetic PostgreSQL instance; no production database,
customer chat, payment credential or phone identity is used.

Final local execution: npm ci/check/build PASS; check reports 421 tests, 365 pass,
56 database-gated skips, zero failures. Separate PostgreSQL executions: worker
26/26 and bot 8/8, zero skips. Catalog 12/12 and ERP Node/Python contracts pass.
An initial repeat worker run used the older schema left by upgrade tests and
failed `duplicate outbox fingerprint is rejected on second enqueue` (missing
depends_on_id). Reapplying migrations, as CI already does, restored 26/26 PASS.
This was a disposable fixture failure, not a production outage.

| Area | Evidence / execution | Acceptance boundary |
| --- | --- | --- |
| FSM | `npm run test --workspace @yubie/assistant` | Menus, four products, aliases, bounded fallback, reset, approved facts, B2B consent, ownership and priority routing |
| Product contract | Domain and integrations suites | Four stable IDs, nine variants, fixed-origin URLs, publication and media approval guards |
| Native media | Integration fixture tests | Base64 JPEG/PNG article, bytes/hash/dimensions, rejection, ambiguous acknowledgment; simulated Zammad only |
| Capabilities | Config, assistant and API suites | Existing launch profile plus approved artifact evidence; production payment remains disabled |
| Webhook | Bot suite with DATABASE_URL | Signature/bearer rejection, numeric IDs, bounded stream, durable acknowledgment, replay; unavailable PostgreSQL returns 503 |
| Atomicity / upgrade | Persistence suite with DATABASE_URL | Fresh and upgraded schemas, transactional state/audit/outbox and rollback |
| Ownership / recovery | Worker suite with DATABASE_URL | Takeover at dispatch, OFF, lifecycle closure, old events, bounded retries/dead letter, internal safety routing, media fallback |
| Queue restart | `node --test --test-name-pattern='pg-boss restart' apps/worker/tests/yubi-reliability.test.mjs` with DATABASE_URL | Real pg-boss stop/start retains wakeup; replay creates one logical turn; simulated provider |
| Local backup/restore | `artifacts/qa/yubi-v2/local-restore.json` | Disposable pg_dump/pg_restore passed; accepted outbox status and reentry fields retained; production restore NOT_ACCEPTED |
| Financial boundaries | `npm run payment:scan`, Semgrep CI | No bot cart/payment/order/address/inventory mutation action |
| Full repository | `npm ci`, `npm run check`, `npm run build`, catalog and ERP contract suites | See candidate CI receipt; DB-gated tests skip when DATABASE_URL is absent |
| Five CI gates | quality, persistence, security, browser, containers | All must pass on the reviewed candidate; source SBOM and verified catalog artifact retained |

Local database suites must run sequentially where legacy upgrade fixtures share
the root database. Run `npm run db:migrate` again after persistence tests before
API/worker/bot consumers. V2 integration fixtures create isolated databases.
Dependencies are refreshed to remove vulnerable nested build dependencies; no
Trivy exclusion is added. Docker's default network initially blocked the local
vulnerability database download; host networking allowed the scan. It exposed two
nested image-size findings after the earlier sharp/undici/ws fixes. A clean npm 10
lockfile resolution removes those vulnerable entries. The unchanged GitHub security
gate remains required on the final candidate.
The local scan now passes with zero HIGH/CRITICAL findings and no exclusions.
Semgrep scans 249 source targets with zero blocking findings. A clean npm 10
install also passes, avoiding the npm 11 optional-dependency mismatch seen in
superseded CI runs.

Independent specification, standards and security reviews identified dispatch
guard races, lifecycle/reentry gaps, ordering and retry hazards. Regression tests
cover the fixes. Those engineering reviews grant no operator or product approval.

## Required real staging exercise — BLOCKED_EXTERNAL

Use the exact approved artifact, real approved sender/recipient and customer
service window. Keep identities and raw messages in protected operator records.

1. Record running Zammad version/digest, channel, service principal and trigger.
2. Send customer `menu`; record ticket/article, authenticated durable inbox,
   engine turn, outbox, outgoing article and actual WhatsApp recipient receipt.
3. Select each product. Verify final approved photograph, exact variants/prices,
   caption and canonical PDP on the recipient device. Test an explicit sequence
   if the deployed channel cannot preserve the caption/link on one image article.
4. Replay the webhook, reorder events, restart the worker and lose a provider
   acknowledgment. Confirm one logical reply and no blind resend.
5. Take human ownership between queued effects. Confirm remaining public sends
   stop. Close/reopen; require operator release, cooldown and customer reentry.
6. Report a food-safety issue while bot-eligible, human-owned and OFF. Confirm
   priority group routing and public silence whenever unauthorized.
7. Expire the service window, reject media and interrupt Zammad. Verify safe
   suppression/fallback, bounded retries, reconciliation and operator recovery.
8. Exercise emergency OFF and rollback; accept real alerts, authorized backup and
   isolated restore, retention, after-hours behavior and named support UAT.

Archive sanitized correlation/article/outbox IDs, provider delivery timestamps,
recipient confirmation, artifact digest and named reviewer. Missing evidence is
BLOCKED_EXTERNAL, never PASS. HTTP 2xx and mock calls are insufficient.

R2 remains blocked on four approved final photos. R3 real channel, R4 operational
acceptance and R5 release authorization remain open. Website commerce has a
separate acceptance gate and stays disabled.
