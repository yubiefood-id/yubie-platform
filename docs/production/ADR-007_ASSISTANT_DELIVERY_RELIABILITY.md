# ADR-007: Assistant Delivery Reliability

**Status:** Accepted  
**Date:** 2026-09-20

## Context

M2-SH sent Chatwoot replies inline inside `assistant.process`, with no durable outbound state, no idempotency on delivery, and no reconciliation after downtime or ambiguous HTTP responses.

## Decision

1. **Commit-then-deliver:** Assistant pipeline writes `assistant_runs`, `assistant_actions`, and `assistant_outbox` in the same database transaction scope, then enqueues `chatwoot.reply`.
2. **Outbox states:** `pending → delivering → delivered | retry | ambiguous | failed`.
3. **Human gate:** Before delivery, re-read local session and Chatwoot conversation status; drop automated reply if human is active.
4. **Idempotency:** Fingerprint `(conversation_ref, payload_fingerprint)` prevents duplicate enqueue; HTTP send uses derived idempotency key.
5. **Reconciliation:** Scheduled `chatwoot.reconcile` job repairs session/handoff drift and purges expired webhook raw bodies.

## Consequences

- Duplicate customer messages are prevented under retry and timeout conditions.
- Chatwoot remains transcript authority; Yubie stores delivery intent, not full transcript.
- Operators can inspect outbox dead letters via `/ops/assistant`.
