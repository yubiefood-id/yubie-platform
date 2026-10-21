# Financial acceptance — partial, PSP BLOCKED_EXTERNAL

2026-10-21. No real-money operation, provider sandbox create, callback, refund or settlement was executed. Existing iPaymu adapter remains sandbox-only. Existing merged payment hardening and probe tooling were reused.

## Real local PostgreSQL

Dedicated disposable PostgreSQL17 container `yubie-release-postgres`, loopback55432, pinned to the same image digest as CI. Synthetic fixtures only. Persistence suites create/drop isolated databases or reset only this disposable test database; never point them at staging/production. The complete persistence run during this session had **28 pass / 0 fail / 0 skipped**. The focused payment-queue/metric API subset had **4 pass / 0 fail / 0 skipped**. Final rerun output is retained privately under `artifacts/qa/verification/postgres-final.log`; API acceptance has43pass/0fail/0skipped, including the four payment exception tests. PostgreSQL is real; provider responses are controlled doubles. This is not PSP acceptance.

Coverage includes 2/10/100 concurrent distinct-key submits for guest and authenticated principals, same-key contention, different-guest separation, last-unit race, durable intent/order/payment/reservation linkage and stock consistency. Recovery tests inject failures before payment commit and exception outbox commit, assert inbox/audit/state rollback, redeliver, and race ten repeated late callbacks.

New fixes serialize callbacks on the payment row and reload order state under lock. Verified success after terminal expiry/failure/cancel/refund creates a durable exception without reviving order or consuming released stock. A second successful transaction preserves the first charge identity and records the second for triage. Exception state, audit and outbox commit atomically; queue and metrics include both reasons. No automatic refund/retry is added. Repository errors abort processing rather than acknowledge a committed inbox. An explicit same raw-body-hash regression failed before the fix and passed against PostgreSQL afterward: a newly authoritative lookup must not be lost to raw callback deduplication.

Durable outbox records and metric counters do not prove external notification delivery. Actual queue draining, on-call alerts and reconciliation ownership require G9 evidence.

## PAY-01–20

| Case | Local evidence / boundary | Real provider verdict |
|---|---|---|
|01 concurrency2/10/100 | Real PG guest/auth, same/distinct keys and exact counts | PASS_LOCAL_DB only |
|02 rapid submit | Browser disabled submission + server uniqueness | NOT_RUN_REAL |
|03 network ambiguity | Abort/reload same UUID; PG injected failures; no PII in session storage | BLOCKED_EXTERNAL |
|04 HTTP408/409/429/500/502/503/504 | Adapter doubles;409 ambiguous;500 retains browser key | BLOCKED_EXTERNAL |
|05 crash boundaries | PG commit/inbox/outbox rollback/replay; no actual remote process-kill proof | PARTIAL |
|06 keys/last unit | PG unique intent and final-stock race; request validation | PASS_LOCAL_DB only |
|07 price/promo/shipping | Existing server-total and aggregate PSP-line tests; Finance approval absent | BLOCKED_OWNER |
|08 variants/limits | Nine literal browser variants + backend limits/invariants | NOT_RUN_PROVIDER |
|09 signed sandbox create | Existing probe reused; not called | BLOCKED_EXTERNAL |
|10 completion/callback | No approved reachable isolated callback/test method/keys | BLOCKED_EXTERNAL |
|11 forged/mismatched callback | Local API/application/PG negative tests; no provider attack | PASS_LOCAL_ONLY |
|12 replay/normalization | Local replay/late/stale; written timestamp/canonicalization contract absent | BLOCKED_EXTERNAL |
|13 authoritative lookup | Mismatch/relookup tests; browser return cannot mark paid | BLOCKED_EXTERNAL |
|14 expiry/late capture | PG exception + terminal stock unchanged + concurrent replay | BLOCKED_EXTERNAL |
|15 orphan/unknown | Existing reconciler + exception queue/metric; provider lookup/cancel contract absent | BLOCKED_EXTERNAL |
|16 ownership | Existing guest/customer binding tests; live two-customer acceptance absent | PARTIAL |
|17 security/fraud | Local validation/allowlists/signature/redirect tests; full staging ASVS/DAST absent | PARTIAL |
|18 duplicate/partial refund | No accepted production refund implementation | NOT_IMPLEMENTED / P0 |
|19 payout/fees/GL | No Finance-approved ledger/settlement fixture or receipt | BLOCKED_EXTERNAL / P0 |
|20 restart/restore | Local rollback; no off-host pending-payment recovery/worker restart receipt | PARTIAL / BLOCKED_EXTERNAL |

Protected sandbox environment now requires review and prevents self-review; secret-name listing was empty. Supply fresh keys through its secret store only. Separate sandbox callback/database hosting, written contract and approved test method/window remain absent. The existing `scripts/ipaymu-sandbox-probe.mjs` can prove CREATE_SESSION_PASS only. A separate mandatory sandbox browser gate explicitly reports BLOCKED_PROVIDER_ACCEPTANCE until callback/refund/settlement acceptance is implemented and evidenced; public-page passes cannot turn it green.

Required written iPaymu answers: SessionID cancel; reference/session lookup; duplicate reference behavior; transaction-ID discovery after accepted-create timeout; callback timestamp MAC/skew; exact JSON/form signature normalization. The existing `docs/production/runbooks/ipaymu-sandbox-e2e.md` remains the minimum procedure. No LIVE host/credential, unsupported refund or guessed provider contract may bypass these gaps.
