# M5-D Baseline

**Date:** 2026-09-20  
**Purpose:** Authoritative repository state before deterministic WhatsApp concierge implementation.

## Git state

| Item | Value |
|------|-------|
| HEAD | `f1d92ec` |
| `origin/main` | `a3379bb` |
| Branch | `main` (ahead of origin) |
| Graphify WIP | Committed in `f1d92ec` |

## Graphify state

| Item | Value |
|------|-------|
| Doctor | 0 errors, 0 warnings |
| Query graph | `graphify-out/engineering-graph.json` (4628 nodes, 5769 edges) |
| Freshness | `CODE_FRESH_SEMANTIC_STALE` |
| Semantic provider | Cursor CLI |
| ACP fallback | Available |
| AST graph | Usable for all M5-D development |

## Current assistant execution path

```
WhatsApp → Zammad → POST /webhooks/zammad (apps/bot)
  → webhook_inbox → pg-boss assistant.process
  → apps/worker assistant-handler.ts
  → runAssistantPipeline() + createModelProviderFromEnv()  [TO BE REPLACED]
  → assistant_outbox → support.reply → ZammadSupportProvider
```

## Model invocation locations (pre-M5-D)

- `apps/worker/src/assistant-handler.ts` — `runAssistantPipeline`, `createModelProviderFromEnv`
- `packages/assistant/src/pipeline.ts` — `deps.model.generate()`
- `packages/assistant/src/structured-classifier.ts` — `StructuredIntentClassifier` (not used in worker; worker uses `RuleOnlyStructuredClassifier`)

## Support provider boundary

- Port: `packages/application/src/ports/support-conversation-provider.ts`
- Zammad adapter: `packages/integrations/src/zammad/support-provider.ts`
- Handoff: `packages/integrations/src/zammad/handoff.ts`
- `packages/assistant` has no Zammad imports

## Persistence state

- Migrations: `0001`–`0004` applied in CI
- Human control: `conversation_sessions.state`
- Flow menu state: **not yet** — `0005_m5_deterministic_concierge.sql` planned

## Tests (pre-M5-D)

- `packages/assistant/tests/` — pipeline, eval, multi-turn
- `apps/worker/tests/` — assistant human-active, outbox delivery
- `packages/integrations/tests/zammad.test.mjs` — provider contract

## M4.5 external blockers

Per `M4_5_ACCEPTANCE_REPORT.md`:

- ZAMMAD_STAGING: BLOCKED_EXTERNAL
- WHATSAPP_STAGING: BLOCKED_EXTERNAL
- PRODUCTION_READY: NO
- PRODUCTION_ACTIVE: NO

M5-D code development proceeds independently of live staging.
