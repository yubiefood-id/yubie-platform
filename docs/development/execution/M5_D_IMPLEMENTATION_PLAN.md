# M5-D Implementation Plan (Execution Tracker)

**Milestone:** Deterministic WhatsApp Concierge  
**Flow version:** `deterministic-v1`  
**Default engine:** `BOT_ENGINE=deterministic`

## Waves

| Wave | Scope | Status |
|------|-------|--------|
| G0 | Graphify gate | DONE |
| 0 | Baseline + contract freeze | DONE |
| 1 | Conversation spec | DONE |
| B | Migration 0005 + flow-state repo | DONE |
| A | Deterministic engine (`packages/assistant/src/deterministic/`) | DONE |
| C | Engine router + worker integration | DONE |
| D | Handoff destinations + Zammad config | DONE |
| E | Fixture suites + integration tests | DONE |
| 14 | Analytics metrics | DONE |
| 16 | End-to-end integration test | DONE |
| Docs | ADR-011, security, acceptance | DONE |
| 17 | Graphify post-wave validation | DONE |

## Contract freeze

- `SupportConversationProvider` — extend via logical `HandoffDestination`, not Zammad types
- `NormalizedMessage`, `ConversationState`, `AssistantOutcome` — domain unchanged; deterministic engine maps to these
- `getPurchaseOptions`, `PostgresKnowledgeRepository.getEffectivePublicKnowledge` — consumed, not modified semantically
- Webhook inbox dedupe + outbox fingerprint — unchanged

## Graphify loop (per wave)

```bash
npm run graph:context
# implement
npm run graph:update && npm run graph:doctor && npm run graph:context
```
