# Zammad Operations Runbook

## Stack

Dedicated VPS running official `zammad-docker-compose` with Yubie override. See `infrastructure/zammad/README.md`.

## Health checks

~~~bash
export ZAMMAD_BASE_URL=https://support-staging.yubie.id
export ZAMMAD_API_TOKEN=...
infrastructure/zammad/scripts/verify.sh
~~~

## Key metrics (no PII labels)

Bot (`GET /metrics`):

- `zammad_webhook_received_total`
- `zammad_webhook_duplicate_total`
- `zammad_webhook_rejected_total`

Worker (`GET /metrics` on port 8789):

- `support_provider_request_total`
- `support_provider_error_total`
- `support_provider_timeout_total`
- `assistant_outbox_pending` / `assistant_outbox_ambiguous` / `assistant_outbox_failed`
- `support_reconcile_lag_seconds`
- `assistant_handoff_total`
- `human_takeover_total`

Structured logs: `support.reconcile` (`scanned`, `changed`, `errors`)

## Assistant runtime

~~~bash
curl -s https://api.yubie.id/ops/assistant
# emergency off without redeploy
curl -X POST https://api.yubie.id/ops/assistant/emergency-off -H "Authorization: Bearer ..."
~~~

## Common issues

| Symptom | Check |
|---------|-------|
| No webhook | Trigger active? Bot URL reachable? HMAC secret match? |
| Duplicate replies | `X-Zammad-Delivery` dedupe; outbox fingerprint |
| Bot replies after human takeover | Reconcile lag; `getCurrentHumanState` |
| WhatsApp not delivering | Article `type` in staging; Meta channel config |

## Backup

Run `infrastructure/zammad/scripts/backup.sh` on Zammad VPS. Not covered by Yubie DB backup.

## Upgrade

1. Review Zammad security release notes
2. Update `zammad.lock.json` pin
3. Staging upgrade + `verify.sh`
4. Production during maintenance window
