# WA-03 — Bounded AI Opt-In & Knowledge Safety Receipt

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` · **Base:** WA-02 commit `344ded6`

## Stage states

| Stage | State |
| --- | --- |
| SOURCE_AUDITED | PASS |
| LOCAL_TESTS_GREEN | PASS (see below; Fake/Throwing providers only — zero real model calls, zero spend) |
| STAGING_EVAL (real model) | **BLOCKED_EXTERNAL** — no staging vLLM endpoint or owner-approved model/pricing; SHADOW-with-calls-disabled posture per GOAL_PLAN |
| OWNER_APPROVED / PRODUCTION_ENABLED | NOT REQUESTED — `ai_assist_enabled=false` default; menu entry remains a deterministic dead end until `POST /ops/whatsapp/ai-policy` sets a complete live policy |

## What changed

- **Migration 0030** (`0030_ai_usage_budget.sql`): `ai_usage_reservations` (idempotent by `request_id` = outbox payload fingerprint; reserved/actual in+out tokens, model, price version, estimated/actual micro-USD, terminal states incl. expired/refunded) + `ai_usage_periods` (per conversation / contact-day / global-day / global-month counters). Additive; rollback = drop 2 tables.
- **`packages/assistant/src/ai-assist.ts`**: provider-neutral `AIAssistProvider` port; `ThrowingAIAssistProvider` (fail-closed default — `createAIAssistProviderFromEnv()` without `AI_ASSIST_PROVIDER` returns throwing), `FakeAIAssistProvider` (tests), `VllmAIAssistProvider` (OpenAI-compatible self-hosted adapter, timeout-bounded, reports real usage). Indonesian system prompt restricts answers to approved facts; **hard output validator** outside the model rejects medical/therapeutic claims, nutrition speculation, prices/payment amounts/instructions, certification claims, prompt-injection echoes and secret leaks; output length bounded by the token cap. Context truncated to last 4 turns / 400 chars per turn; facts bounded.
- **Atomic budget (persistence `PostgresAIUsageRepository`)**: `reserve()` runs in ONE transaction that takes a per-contact advisory lock, checks idempotency by request_id, enforces single in-flight generation per contact (expiry-bounded), conversation/day call caps, global-day reserved-token cap and global-month cost cap, inserts the reservation and moves all counters together. Reserved amounts count conservatively against caps; `complete()` reconciles actual usage/cost **exactly once**; `fail()` keeps conservative accounting; `expireStale()` bounds crashed generations.
- **Worker pipeline**: turn → durable `ai_answer` outbox action (never generates inside the conversation lock). At delivery, after the shared fresh rechecks (runtime mode, session state, capabilities, human state, 24h window): policy live → reserve → single generation attempt → validate → complete → send via the normal idempotent `support.sendReply` path (TIMEOUT/AMBIGUOUS reconcile, never blind resend). ANY denial/failure resolves to a deterministic fallback reply (quota copy vs unavailable copy) — never silence, never a model retry, never a send of unvalidated text.
- **Ops**: `POST /ops/whatsapp/ai-policy` (schema-validated; enabling requires complete limits incl. the owner-held `globalDayTokens`; writes audited config; explicitly cannot enable global AUTO) + AI usage in `GET /ops/whatsapp/status`. Snapshot `aiAssistEnabled` is now `ai_assist_enabled && ai_policy.mode==='live'` — fail-closed on incomplete policy.
- Defaults: `AI_ASSIST_PROVIDER` unset → throwing provider; policy absent → mode off; every path without all of {switch, live policy, complete limits} denies before any model call.

## Test evidence (D-case mapping)

~~~
node --test packages/assistant/tests/trimode-eval.test.mjs      # 15 pass (eval corpus + fail-closed factory)
node --test apps/worker/tests/wa03-ai-budget.test.mjs          # 7 pass (DB)
node --test apps/api/tests/ops-whatsapp.test.mjs               # 2 pass (DB)
~~~
- D03: one bounded generation, validated answer sent, usage completed exactly once (second `complete()` no-op; monthly cost counted once).
- D05: conversation call cap → 0 further model calls + deterministic quota copy fallback.
- D06: 50 concurrent reservations for one contact → exactly 1 reserved, 49 denied `concurrent_request`, 1 reservation row.
- D08: provider TIMEOUT → reservation failed + unavailable fallback, no article; unsafe model output (medical+price+cert) rejected before any send.
- D09 (output side): injection echo + secret leak rejected (eval corpus).
- D17: global-day token cap denies before any provider call (repo-level and delivery-level).
- D20: emergency OFF before dispatch cancels `ai_answer` with zero reservations and zero model calls.
- Zero-AI determinism: `ThrowingAIAssistProvider` default + D01/D02/D04 suite (WA-02) prove menu/navigation/exit paths never request a model.

Known accounting semantics (documented, intentional): reserved tokens count against caps even after failure (conservative); a delivery replay after a terminal reservation is denied rather than double-charged.

## Rollback

Code revert + `DROP TABLE ai_usage_reservations, ai_usage_periods`. Disabling at runtime: `POST /ops/whatsapp/ai-policy {mode:"off"}` or the existing `POST /ops/assistant/emergency-off` (cancels pending customer effects incl. `ai_answer` rows).

## Next safe milestone

WA-04 (B2B CRM projection) — independent of the AI path.
