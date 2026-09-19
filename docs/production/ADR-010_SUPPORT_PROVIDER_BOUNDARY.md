# ADR-010: Support Provider Boundary

## Status

Accepted (M4-Z)

## Context

Chatwoot-specific types leaked into worker handlers and session persistence. M4-Z requires swappable support providers without assistant rewrites.

## Decision

Introduce `SupportConversationProvider` in `packages/application`:

- `getThread`, `getRecentMessages`, `sendReply`, `getCurrentHumanState`, `handoff`, `listThreadsUpdatedSince`
- Result codes include `AMBIGUOUS` for timeout-after-accept outbound cases

Implementations:

- `FakeSupportProvider`
- `ChatwootSupportProvider` (migration/rollback)
- `ZammadSupportProvider` (target production)

Selection via `SUPPORT_PROVIDER` env (falls back to `CHAT_PROVIDER`).

## Schema strategy

Expand/backfill only in `0004_m4_zammad_provider.sql`:

- `conversation_sessions.provider`, `provider_thread_id`, ...
- Keep `chatwoot_*` columns until post-cutover cleanup

## Consequences

- Worker queues renamed to `support.reply` / `support.reconcile` (Chatwoot queue names aliased temporarily).
- `packages/assistant` has zero Zammad imports.
