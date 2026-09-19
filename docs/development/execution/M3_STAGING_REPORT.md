# M3 Staging Report

**Date:** 2026-09-20  
**Status:** INFRASTRUCTURE READY — DEPLOYMENT PENDING

## Compose profiles validated

```bash
docker compose -f infrastructure/docker-compose.prod.yml config
docker compose -f infrastructure/docker-compose.m2-sh.single.yml config
```

Both validate successfully.

## Staging stack (to deploy)

| Component | Image / service | Notes |
|-----------|---------------|-------|
| Yubie API | `ghcr.io/yubiefood-id/yubie-api` | `/ops/assistant` on API |
| Yubie Worker | Local build / GHCR | `assistant.process`, `chatwoot.reply`, `chatwoot.reconcile` |
| Yubie Bot | Local build / GHCR | AgentBot webhook ingress |
| Chatwoot | `chatwoot/chatwoot:v4.17.1` | Isolated Postgres + Redis |
| vLLM | `vllm/vllm-openai:v0.29.0` | GPU profile, internal network |
| Caddy | Documented in VPS guides | TLS for `bot.yubie.id`, `support.yubie.id` |

## Staging smoke checklist

- [ ] Chatwoot UI accessible via TLS
- [ ] Test inbox + AgentBot configured
- [ ] Inbound message → webhook → inbox → worker → shadow pipeline
- [ ] Human handoff in Chatwoot UI
- [ ] Agent reply visible
- [ ] Reconcile job runs (check worker logs)
- [ ] Backup + restore Chatwoot Postgres
- [ ] Emergency OFF via `/ops/assistant/emergency-off`

## Meta WhatsApp

Blocked until Chatwoot staging smoke is green. Operator must provide WABA credentials.
