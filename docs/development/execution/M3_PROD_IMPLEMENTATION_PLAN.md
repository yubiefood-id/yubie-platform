# M3-PROD Implementation Plan

**Date:** 2026-09-20  
**Baseline:** M1 `34556fc` + M2-SH `8e46a00` on local `main`

## Delivered in this phase

| Workstream | Deliverable | Status |
|------------|-------------|--------|
| Baseline | [M3_PROD_BASELINE.md](./M3_PROD_BASELINE.md) | Done |
| Persistence | Migration `0003_m3_prod.sql` — webhook refs, outbox, runtime config, extended runs | Done |
| Webhook minimization | Ref columns + raw body TTL purge | Done |
| Knowledge | `PostgresKnowledgeRepository`, `KnowledgeToolRegistry`, seed | Done |
| Context | `ChatwootConversationContextProvider`, multi-turn pipeline | Done |
| Classification | `StructuredIntentClassifier` + RED prefilter, `RuleOnlyStructuredClassifier` for fake mode | Done |
| Delivery | `assistant_outbox`, `chatwoot.reply` worker, human takeover gate | Done |
| Reconcile | `chatwoot.reconcile` scheduled job + checkpoint | Done |
| Runtime control | `assistant_runtime_config`, `/ops/assistant` API | Done |
| Dependencies | Chatwoot `v4.17.1`, vLLM `v0.29.0` pins | Done |
| Infra | Worker in M2 compose, Dockerfile.worker builds assistant | Done |
| CI | `npm run build` in quality job; worker DB tests | Done |
| ADRs | ADR-007, ADR-008 | Done |

## Remaining operator actions

| Item | Owner | Blocker |
|------|-------|---------|
| Push M1+M2 to origin | Operator | Authorization not granted |
| GPU benchmark on production hardware | Infra | No GPU on dev machine |
| Chatwoot staging VPS deploy | Infra | Credentials + DNS |
| Meta WhatsApp staging | Operator | WABA credentials |
| Shadow/suggestion/green pilots | Ops | Staging green |

## Integration order (completed)

1. Baseline verification  
2. Migration `0003_m3_prod`  
3. Knowledge + context  
4. Structured classification + pipeline  
5. Outbox + reply delivery + reconcile  
6. Runtime config + ops API  
7. Dependency pin updates  
8. Tests + CI expansion  

## Rollout gates

See [M3_PROD_ACCEPTANCE_REPORT.md](./M3_PROD_ACCEPTANCE_REPORT.md) for GO checklist.
