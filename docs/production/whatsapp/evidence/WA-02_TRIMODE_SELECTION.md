# WA-02 — Tri-Mode Selection & Priority Human Queue Receipt

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` · **Base:** WA-01 commit `ca8b8c0`

## Stage states

| Stage | State |
| --- | --- |
| SOURCE_AUDITED | PASS |
| LOCAL_TESTS_GREEN | PASS — engine 9/9, worker 52/52, assistant 49/49, api 63/63, integrations 89/89, bot 8/8 |
| STAGING_REAL_PROVIDER_E2E | **BLOCKED_EXTERNAL** (same owner/Meta/Zammad blockers as WA-01) |
| OWNER_APPROVED / PRODUCTION_ENABLED | NOT REQUESTED — `ai_assist_enabled` defaults **false**; menu change is inert until v2 flow + auto mode are separately activated |

## What changed

- **Migration 0029** (`0029_trimode_conversation_mode.sql`): `conversation_mode_state` (unique per provider+thread, mode `DETERMINISTIC|AI_OPT_IN`), `conversation_mode_events` (audit: customer_opt_in / customer_exit / human_takeover / operator_reset / automation_off), `priority_support_tasks` (P0–P3, due time, ack evidence, exactly-once `source_outbox_id`). Additive; rollback = drop 3 tables.
- **Menu (v2 only; v1 untouched):** HOME gains `7. ✨ Tanya AI Yubi`; AI_INTRO disclosure/consent node; AI_ACTIVE Q&A node with exits (`menu`, `keluar`, `9`, `kembali`, `0`). While policy is off, entry 7 is a deterministic dead end ("belum tersedia") — zero model involvement (D02).
- **Engine effects:** `ENTER_AI_MODE` / `EXIT_AI_MODE` (audit transitions), `REQUEST_AI_ANSWER` (engine never calls a model and never sends — worker owns the decision). Food safety still outranks everything, including inside an AI session (D10-adjacent). Aliases that leave the session still exit; other aliases become questions.
- **Worker:** persists mode transitions in the same conversation-locked transaction; human takeover (observed at intake from Zammad ownership) now **cancels every pending bot customer effect for the thread** (`human_takeover`) and ends an active AI session (D12); fail-closed stub answers any REQUEST with the deterministic unavailable copy until WA-03 lands (no model call).
- **Priority queue:** explicit human requests (`HUMAN_REQUEST`) now carry Zammad high priority alongside the CS group move; delivered P0 (food safety) / P1 (explicit human) handoffs create `priority_support_tasks` rows with due times from proposed internal targets (P0 15 min, P1 60 min — documented as *not* approved SLAs). Replay of a delivered handoff never duplicates the task.
- **Ops:** `GET /ops/whatsapp/status` (botEngine, runtime incl. `aiAssistEnabled`, mode counts, open/unacknowledged priority tasks + oldest age, queue lag; no PII) and `POST /ops/whatsapp/conversation-mode/reset` (schema-validated, audited). Both bearer-gated via the existing `authorizeOps`.

## Design notes / deviations

- Zammad remains the sole authority for ticket ownership/assignment — `priority_support_tasks` deliberately stores no owner column; acknowledgement is tracked (`ack_at`) rather than mirrored staff identity.
- The AI menu entry was added as choice 7 rather than renumbering 1–6, keeping every existing navigation contract intact (v1 compat preserved per GOAL_PLAN WA-02).
- `RuntimeConfigSnapshot` gains `aiAssistEnabled` (key `ai_assist_enabled`, default false, parsed strict-true).

## Test evidence (D-case mapping)

~~~
node --test packages/assistant/tests/deterministic/v2-trimode.test.mjs   # 9 pass
node --test apps/worker/tests/wa02-trimode.test.mjs                     # 5 pass (DB)
node --test apps/api/tests/ops-whatsapp.test.mjs                        # 1 pass (DB)
~~~
Covered locally: D01 (FSM + zero model on all menu paths), D02 (entry without consent/disabled policy), D04 (menu/keluar/0 exit without AI request), D10-adjacent (safety inside AI session), D11 (explicit human → P1 priority task + due time), D12 (takeover cancels pending reply + ends AI session), D13 (existing reentry semantics unchanged), plus replay-safety of the priority task.

One test-harness lesson recorded: unordered `SELECT` on `assistant_outbox` is not insertion order; assertions now order by `created_at,id`.

## Rollback

Code: revert commit (no behavior at default config: AI off, v1 flow default). Migration: additive tables; `DROP TABLE conversation_mode_events, conversation_mode_state, priority_support_tasks` is safe at any time pre-activation.

## Next safe milestone

WA-03 (bounded AI opt-in) — replaces the fail-closed REQUEST stub with the real reservation→generation→validation pipeline behind `ai_assist_enabled` + budget policy.
