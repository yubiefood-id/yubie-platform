# WA-04 — B2B Queue & CRM Projection Receipt

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` · **Base:** WA-03 commit `f3ae787`

## Stage states

| Stage | State |
| --- | --- |
| SOURCE_AUDITED | PASS |
| LOCAL_TESTS_GREEN | PASS — worker 62/62, api ops 2/2 |
| STAGING / OWNER / PRODUCTION | NOT REQUESTED (projection is internal; no external CRM provider exists yet) |

## What changed

- **Migration 0031** (`0031_b2b_crm.sql`): `b2b_accounts` (unique normalized name), `b2b_contacts` (unique email/whatsapp where present), `b2b_opportunities` (**UNIQUE lead_id** = exactly-once projection anchor; stage/owner/next_action_at mandatory), `b2b_tasks` (open follow-up per new opportunity with due time = proposed P2 next-business-day internal target). Additive; rollback = drop 4 tables.
- **`PostgresGrowthOutbox`** (persistence): claim/complete/retry for `growth.b2b_lead_created` mirroring the operations-outbox lease pattern (FOR UPDATE SKIP LOCKED, 5-min lease, 1-min retry backoff, terminal `failed` after 10 attempts) + pending-summary for ops.
- **`PostgresB2bCrmRepository.projectLead`**: one transaction — upsert account by normalized business name (repeated leads converge on one account), upsert contact on natural keys, insert opportunity `ON CONFLICT (lead_id) DO NOTHING`, create the follow-up task only when the opportunity is new. **Privacy: classification fields + contact coordinates only; the lead's free-text `need`/`message` never enters CRM rows** (asserted by test).
- **Worker**: new `growth.crm` queue (every minute + immediate send on startup), handler `processGrowthCrm` throws `GROWTH_CRM_RETRY_PENDING` on any failure so pg-boss retries the batch.
- **Ops status**: `GET /ops/whatsapp/status` now includes `crm` (opportunities, open tasks, unassigned-new count + oldest age, pending lead events + oldest age).

## Scope decision (documented)

WhatsApp B2B qualification (V2 menu → SALES_PARTNERSHIP) continues to land in the Zammad sales queue with the consented summary note — it is **not** auto-projected into CRM in this milestone: the web-form `b2b_contact` consent is scoped to the web lead, and copying chat-derived context into CRM would exceed that purpose (GOAL_PLAN non-goals / consent rules). Linking WhatsApp-origin tickets to opportunities requires an owner-approved consent basis and is recorded as an open decision, not silently implemented.

## Test evidence

~~~
node --test apps/worker/tests/wa04-growth-crm.test.mjs   # 3 pass (DB)
node --test apps/api/tests/ops-whatsapp.test.mjs         # 2 pass (DB)
~~~
- G-F/D25: lead → exactly one account/contact/opportunity/task; event replay no-ops (duplicate counter); injected CRM outage keeps the event pending with `CRM_PROCESSING_FAILED`, nothing half-projected, and recovery replays to exactly one opportunity.
- Account dedupe: two leads from the same business (case-differing) → one account, two opportunities.
- Free-text leakage: `need`/`message` substrings absent from all CRM rows.

## Rollback

Code revert + drop the 4 additive tables; the producing path (`growth.b2b_lead_created` outbox event) predates this change and is unaffected.

## Next safe milestone

WA-05 (approved outbound B2B template gateway, default-off).
