# M5-D Security Report

**Date:** 2026-09-20

## Verdict: PASS (code)

| Control | Status | Evidence |
|---------|--------|----------|
| Zero LLM in deterministic path | PASS | `ConversationEngineRouter` + `ThrowingModelProvider` test |
| Human reachable from every state | PASS | Global `0`/CS aliases in pre-router |
| Human-active suppression | PASS | pre-router noop + existing outbox guard |
| Food-safety escalation | PASS | safety fixtures |
| No medical/allergen advice | PASS | health patterns → handoff |
| Approved knowledge gate | PASS | `PostgresKnowledgeRepository` + guards |
| No arbitrary marketplace URLs | PASS | `getPurchaseOptions` redirect paths |
| No PII in metrics | PASS | bounded metric labels only |
| Provider-neutral assistant | PASS | no Zammad imports in `packages/assistant` |
| Outbox dedupe | PASS | existing fingerprint semantics retained |

## Release blockers checked

No blockers found in code review and automated tests.

## Staging

Live pen-test items remain BLOCKED_EXTERNAL per M4.5.
