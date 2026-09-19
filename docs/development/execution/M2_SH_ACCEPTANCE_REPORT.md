# M2-SH Acceptance Report

**Date:** 2026-09-19  
**Baseline:** M1 `34556fc` + M2-SH implementation  
**Verdict:** **CONDITIONAL GO**

## Summary

Self-hosted WhatsApp AI chatbot vertical slice implemented in code: `apps/bot` AgentBot ingress, `packages/assistant` policy engine, worker async processing, Chatwoot integration adapters, persistence migration, infrastructure compose profiles, eval/security tests, and runbooks.

Production activation remains conditional on operator credentials and GPU benchmark.

## Acceptance checklist

| Gate | Status |
|------|--------|
| M1 stable and committed | PASS |
| Chatwoot self-host compose (pinned v4.13.0) | PASS (code) |
| Chatwoot DB isolated | PASS (separate compose services) |
| AgentBot webhook signed + replay protected | PASS |
| Durable `webhook_inbox` + dedupe | PASS |
| `packages/assistant` deterministic risk policy | PASS |
| Allowlisted tools + response validator | PASS |
| FakeModelProvider CI | PASS |
| VllmModelProvider implemented | PASS |
| GPU benchmark on production hardware | **CONDITIONAL** |
| RED-intent eval zero critical misses | PASS (rule classifier suite) |
| Prompt injection / handoff tests | PASS |
| Shadow mode default | PASS (`ASSISTANT_MODE=shadow`) |
| Human takeover race safety | PASS (validator + status gate) |
| `npm run check` | PASS |
| `npm run build` | PASS |
| Docker bot image Dockerfile | PASS |
| Runbooks + ADR-005/006 | PASS |

## External blockers

- Meta WhatsApp / WABA credentials
- Chatwoot production DNS/TLS (`support.yubie.id`, `bot.yubie.id`)
- SMTP, object storage (Profile B)
- GPU VPS provisioning + model benchmark

## Rollback

- `ASSISTANT_AUTO_REPLY=false`
- Disable AgentBot in Chatwoot
- Humans continue in Chatwoot inbox

## Test evidence

```bash
npm run check   # PASS
npm run build   # PASS
```

Workspaces with new coverage: `@yubie/assistant`, `@yubie/bot`, `@yubie/integrations` (Chatwoot verify).
