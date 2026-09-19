# M5-D Acceptance Report

**Date:** 2026-09-20

## SHAs

| | SHA |
|--|-----|
| Baseline | `f1d92ec` |
| Final | (current HEAD at test time) |

## Axis verdicts

| Axis | Verdict |
|------|---------|
| CODE | PASS |
| DETERMINISTIC_ENGINE | PASS |
| ZERO_AI | PASS |
| PERSISTENCE | PASS |
| SECURITY | PASS (code) |
| GRAPHIFY | PASS |
| LOCAL_INTEGRATION | PASS |
| ZAMMAD_STAGING | BLOCKED_EXTERNAL |
| WHATSAPP_STAGING | BLOCKED_EXTERNAL |
| PRODUCTION_READY | NO |
| PRODUCTION_ACTIVE | NO |

## Acceptance checklist

- [x] `BOT_ENGINE=deterministic` implemented (default)
- [x] Model provider not instantiated in deterministic path
- [x] Zero-model fixture suite (`zero-ai.test.mjs`)
- [x] Flow definitions validated at startup
- [x] Global CS escape (`0`, aliases)
- [x] Second unknown → handoff
- [x] Flour purchase via marketplace registry path
- [x] Shake/Ppang coming soon
- [x] Sensitive facts require approval or handoff
- [x] B2B progressive qualification
- [x] No CRM implementation
- [x] Flow state persistence (`0005` migration + repository)
- [x] Human takeover suppression preserved
- [x] Provider-neutral Zammad boundary
- [x] Analytics without raw message content

## Architecture

```
Zammad webhook → inbox → assistant.process → ConversationEngineRouter
  → DeterministicConversationEngine → assistant_outbox → support.reply
```

**Flow version:** `deterministic-v1`  
**Migration:** `0005_m5_deterministic_concierge.sql`

## Test commands

```bash
npm ci
npm run build
npm run test --workspace @yubie/assistant
npm run test --workspace @yubie/worker
npm run test --workspace @yubie/persistence
npm run test --workspace @yubie/integrations
npm run check
```

## Rollback

1. `BOT_ENGINE=legacy`
2. `ASSISTANT_MODE=shadow`
3. Flow state table is additive; safe to ignore on rollback

## Next milestone

Complete M4.5 live staging validation, then production cutover per Zammad runbooks.
