# M5-D-RC Baseline

**Date:** 2026-09-20  
**Milestone:** Deterministic Concierge Release Candidate

## Git state

| Item | Value |
|------|-------|
| M5-D code baseline | `796d923` (feat bot engine) |
| M5-D RC baseline | `6bfe60a` (docs RC evidence) |
| RC commits | `df615c0`..`6bfe60a` (migration proof, business hours, zammad tags, worker tests, docs) |
| Branch | `main` |
| Working tree | clean after RC commits |

## Quality gate evidence

Commands run on 2026-09-20 (post-RC hardening):

```bash
npm ci          # PASS
npm run lint    # PASS (1 pre-existing web warning)
npm run typecheck # PASS
npm run test    # PASS
npm run check   # PASS
npm run build   # PASS
bash scripts/migration-proof-0005.sh  # PASS (fresh + upgrade)
DATABASE_URL=postgresql://yubie:yubie_local@127.0.0.1:55433/yubie_test \
  node --test apps/worker/tests/deterministic-integration.test.mjs  # 6/6 PASS
```

## Graphify state (post-M5-D commit)

| Item | Value |
|------|-------|
| Doctor | 0 errors |
| Freshness target | CODE_FRESH + release-relevant semantic docs |
| Query graph | `graphify-out/engineering-graph.json` |

## Architecture

```
WhatsApp → Zammad → apps/bot webhook → webhook_inbox
  → pg-boss assistant.process → ConversationEngineRouter (BOT_ENGINE=deterministic)
  → conversation_flow_state → assistant_outbox → support.reply → Zammad → WhatsApp
```

## Configuration contract

| Variable | Purpose |
|----------|---------|
| `BOT_ENGINE=deterministic` | Default production engine |
| `ZAMMAD_GROUP_*` | Logical handoff → Zammad group IDs |
| `ZAMMAD_PRIORITY_HIGH` | Food Safety high priority |
| `YUBIE_BUSINESS_HOURS_JSON` | Handoff copy selection |

## Axis matrix (initial)

See [M5_D_RC_ACCEPTANCE_REPORT.md](./M5_D_RC_ACCEPTANCE_REPORT.md) for independent verdicts.

## Rollback baseline

1. Emergency: `POST /ops/assistant/emergency-off`
2. `BOT_ENGINE=legacy` + `ASSISTANT_MODE=shadow`
3. Do not drop migration 0005 tables during incident response
