# M4.5 Load / Burst Report

**Date:** 2026-09-20  
**Status:** BLOCKED_EXTERNAL

## Objectives

Correctness under concurrency first — not vanity TPS.

## Planned scenarios

| Scenario | Target | Status |
|----------|--------|--------|
| 10 simultaneous conversations | No cross-ticket replies | PENDING |
| Duplicate webhook burst | Dedupe → single run | PENDING |
| 20–50 event burst | Queue absorbs; no loss | PENDING |
| Model latency spike | Outbox backlog recovers | PENDING |
| Provider 429 | Retry without duplicate send | PENDING |
| Worker restart during queue | Outbox resumes | PENDING |

## Metrics to record (when run)

- P50 / P95 assistant_run latency
- Queue depth (`assistant_outbox_pending`)
- `zammad_webhook_duplicate_total` rate
- Error rate (`support_provider_error_total`)
- Recovery time after restart

## Code instrumentation (M4.5)

Worker metrics added:

- `support_provider_request_total`
- `support_provider_error_total`
- `support_provider_timeout_total`
- `assistant_outbox_pending` / `ambiguous` / `failed`
- `support_reconcile_lag_seconds`
- `human_takeover_total`
- `assistant_handoff_total`

Bot metrics (existing):

- `zammad_webhook_received_total`
- `zammad_webhook_rejected_total`
- `zammad_webhook_duplicate_total`
