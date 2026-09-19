# M3-PROD Acceptance Report

**Date:** 2026-09-20  
**Verdict:** **CONDITIONAL GO** (code complete; staging/GPU/pilot pending)

## GO gate checklist

| Gate | Status | Evidence |
|------|--------|----------|
| M1/M2 on authoritative branch | PARTIAL | Local `main` at `8e46a00`; not pushed to `origin/main` |
| Chatwoot v4.17.x pinned | PASS | `infrastructure/chatwoot/docker-compose.yml` |
| vLLM v0.29.x pinned | PASS | `infrastructure/vllm/docker-compose.yml` |
| Self-host Chatwoot staging | PENDING | [M3_STAGING_REPORT.md](./M3_STAGING_REPORT.md) |
| Raw conversation duplication minimized | PASS | Migration `0003`, refs + TTL purge |
| Webhook inbox durable/idempotent | PASS | Dedupe + processing states |
| Multi-turn context | PASS | `multi-turn.test.mjs` |
| Knowledge APPROVED_PUBLIC enforced | PASS | `PostgresKnowledgeRepository` |
| Business hours not hardcoded in tools | PASS | `KnowledgeToolRegistry` + seed |
| RED prefilter + structured classifier | PASS | `structured-classifier.ts` |
| Unknown/low confidence → handoff | PASS | `requiresHandoff` path |
| assistant_runs/actions persisted | PASS | `PostgresAssistantRunRepository` |
| Version traceability | PASS | classifier/policy/prompt/knowledge versions on runs |
| Outbound durable | PASS | `assistant_outbox` + `chatwoot.reply` |
| Ambiguous send no duplicate | PASS | Fingerprint dedupe + human gate test |
| Reconciliation | PASS | `chatwoot.reconcile` scheduled job |
| Human takeover wins | PASS | `outbox-delivery.test.mjs` |
| Emergency OFF without rebuild | PASS | `/ops/assistant/emergency-off` |
| Per-intent kill switches | PASS | Runtime config `allowed_green_intents` |
| Observability | PARTIAL | Structured JSON logs + bot `/metrics`; OTel deferred |
| No public Redis/Postgres/vLLM | PASS | Compose network isolation |
| Backup/restore tested | PENDING | Operator drill required |
| GPU benchmark | PENDING | [M3_MODEL_BENCHMARK.md](./M3_MODEL_BENCHMARK.md) |
| Eval 200+ cases | PASS | 260 seeded cases |
| Shadow pilot | PENDING | Requires staging WhatsApp |
| Suggestion pilot | PENDING | Requires staging |
| GREEN auto pilot | PENDING | Requires measured pilot |
| Meta WhatsApp staging | PENDING | After Chatwoot green |
| Human support while AI disabled | PASS | Chatwoot independent; emergency OFF API |

## Verification commands

```bash
npm ci
npm run lint && npm run typecheck && npm run test && npm run check && npm run build
DATABASE_URL=postgresql://yubie:yubie_local@localhost:5432/yubie_dev npm run db:migrate
DATABASE_URL=postgresql://yubie:yubie_local@localhost:5432/yubie_dev npm run db:seed
```

## Stop condition

M3-PROD code path is complete. **Do not proceed to M4 CRM** until staging shadow/suggestion/green pilots pass with reproducible evidence on real infrastructure.
