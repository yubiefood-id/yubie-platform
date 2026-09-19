# M3 Security Review

**Date:** 2026-09-20  
**Scope:** M3-PROD assistant productionization changes

## Automated controls

| Control | Status |
|---------|--------|
| Chatwoot webhook HMAC + replay window | PASS (existing + unchanged) |
| Webhook body size limit | PASS |
| Ops API Bearer token (`OPS_API_TOKEN`) | Implemented |
| No raw message in structured logs | PASS (handler logs refs only) |
| Raw webhook TTL purge | Implemented (72h + cleanup job) |
| Human takeover before outbound | PASS (outbox delivery gate) |
| RED prefilter before model | PASS |
| Tool allowlist only | PASS |
| Response validator | PASS |

## Test coverage

| Test | File |
|------|------|
| Forged/missing webhook signature | `packages/integrations/tests/chatwoot.test.mjs` |
| Prompt injection → handoff | `packages/assistant/tests/eval-cases.test.mjs` |
| Human race → no bot reply | `apps/worker/tests/outbox-delivery.test.mjs` |

## Network exposure

| Service | Exposure |
|---------|----------|
| vLLM | Internal `ai_internal` network only |
| Chatwoot Redis/Postgres | Internal compose networks |
| Yubie Postgres | Internal compose network |
| Bot ingress | Edge network (Caddy TLS required in staging) |

## Outstanding (staging required)

- SSRF / rate flood load tests on bot ingress
- Cross-conversation leakage test with real Chatwoot
- vLLM public exposure scan on staging VPS
- Backup/restore drill (see DR runbook)

## Verdict

**CONDITIONAL GO** for code merge. Production pilot blocked until staging security smoke and GPU host hardening complete.
