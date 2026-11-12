# WA-07 — Production Hardening & Staged-Release Evidence (Mission Summary)

**Date (UTC):** 2026-11-11 · **Branch:** `feat/whatsapp-trimode-wa00-wa07`
**Base:** `283d2f46` (main, PR #88) · **Milestone commits:** WA-00 `ade85f0` → WA-01 `ca8b8c0` → WA-02 `344ded6` → WA-03 `f3ae787` → WA-04 `f469230` → WA-05 `473e176` → WA-06 `838b07f`

## Stage states (EVALUATION_AND_RELEASE_GATES separation)

| Stage | State | Evidence |
| --- | --- | --- |
| SOURCE_AUDITED | **PASS** | WA-00 ledger; every GOAL_PLAN §1 "exists" claim re-verified in code |
| LOCAL_TESTS_GREEN | **PASS** | `npm run check` green (lint + typecheck + secret/payment scans + release-materials tests + 14-workspace suite, CI quality-job parity); DB-gated suites additionally run against ephemeral Postgres with full migration replay — final counts below |
| STAGING_REAL_PROVIDER_E2E | **BLOCKED_EXTERNAL** | No Meta test number/WABA identity, no Zammad staging credentials, no webhook secret (owner/Meta/Zammad-admin items). Never fabricated. |
| OWNER_APPROVED | **PENDING** | AI spend caps, SLA values, template copy, consent/retention texts, phone-number decision (WA-06 matrix) all owner-held |
| PRODUCTION_ENABLED | **NO-GO** | Nothing in this branch activates any WhatsApp behavior (see defaults below); production remains `SUPPORT_PROVIDER=disabled`, bot behind `--profile bot` |

## What shipped (per milestone; receipts in this directory)

- **WA-00** baseline evidence ledger + BLOCKED_EXTERNAL owner matrix.
- **WA-01** contract-test hardening of the existing vertical slice (24h window fail-closed, media-only inbound, non-WhatsApp article types).
- **WA-02** tri-mode selection: migration **0029** (`conversation_mode_state`+events, `priority_support_tasks`); V2 menu `7. Tanya AI Yubi` with disclosure/consent/Q&A nodes; `ENTER/EXIT_AI_MODE` + `REQUEST_AI_ANSWER` effects (engine never calls a model, never sends); human takeover cancels pending bot replies per thread and ends AI sessions; P0/P1 handoffs create audited priority tasks with due times; `GET /ops/whatsapp/status` + audited mode reset.
- **WA-03** bounded AI: migration **0030** (reservations + atomic period counters); `AIAssistProvider` port (Throwing default / Fake / vLLM); hard output validator (medical, nutrition, price, payment, certification, injection, secrets); worker pipeline = shared rechecks → atomic reserve (per-contact lock, idempotent `request_id`, conversation/day/global caps, single in-flight) → single generation → validate → reconcile-once → idempotent send; deterministic fallback on every denial/failure; `POST /ops/whatsapp/ai-policy` (complete limits required; cannot enable global AUTO).
- **WA-04** B2B CRM: migration **0031**; `growth.crm` consumer for `growth.b2b_lead_created` (lease pattern, terminal after 10); exactly-once projection (UNIQUE lead_id), account dedupe, mandatory next action; free-text need/message never enters CRM; ops CRM health.
- **WA-05** outbound gateway: migration **0032**; transport port + fail-closed factory + Meta Cloud API adapter (5xx→ambiguous); `outbound.whatsapp` queue no-ops while `outbound_whatsapp {enabled:false}`; full recheck chain before every dispatch (consent revoke precedence, template approved, approval expiry, per-contact frequency cap, cost cap); ambiguous outcomes reconcile receipts, never blind-resend; ops draft/approve bound to immutable content hash.
- **WA-06** coexistence decision record (A/B/C matrix; test-number path recommended; vendor/owner evidence BLOCKED_EXTERNAL) + D21/D22 architecture assertions (one inbound route, no Coexistence adapter, fail-closed outbound).

## Default-off guarantee (what a merge does NOT do)

- `ai_assist_enabled=false` AND no live `ai_policy` → AI menu entry is a deterministic dead end; zero model calls possible (provider factory itself defaults to a throwing no-op).
- `outbound_whatsapp {enabled:false}` + no `OUTBOUND_WHATSAPP_PROVIDER` credentials → outbound gateway cannot send anything.
- `SUPPORT_PROVIDER`/`BOT_ENGINE` semantics untouched; v1 flow remains default; production bot remains deferred (2026-10-24 owner decision stands).
- No payment/checkout/shipping code paths modified (payment-rule scan green).

## Final local test evidence

Per-suite (ephemeral Postgres 16 via docker, throwaway databases per suite, full 0001–0032 migration replay):
`assistant 64/64` (+9 WA-02 engine, +15 WA-03 eval) · `persistence 108/108` (+migration 0029–0032 replay) · `integrations 89/89` · `worker 70/70` (+4 WA-01, +5 WA-02, +7 WA-03, +3 WA-04, +5 WA-05, +3 WA-06) · `api 64/64` · `bot 8/8` · `validation 8/8` · plus the full `npm run check` gate green (D-case coverage mapped per receipt).

D-matrix (EVALUATION_AND_RELEASE_GATES): D01 ✓ D02 ✓ D03 ✓ D04 ✓ D05 ✓ D06 ✓ D07 ✓(pre-existing yubi-reliability) D08 ✓ D09 ✓(output side) D10 ✓ D11 ✓ D12 ✓ D13 ✓(existing reentry) D14 ✓(scope: human review preserved; CRM projection) D15 ✓ D16 ✓(out-of-window: approved-template-only path; free-form window enforced) D17 ✓ D18 ✓(pre-existing) D19 ✓(pre-existing) D20 ✓ D21 ✓ D22 ✓ D23 **BLOCKED_EXTERNAL** (real device) D24 ✓(status surface; alert wiring = ops follow-up) D25 ✓.

## Known gaps / follow-ups (honest)

1. All staging/real-provider axes remain **BLOCKED_EXTERNAL** until Meta test number + Zammad staging credentials are provisioned; no live claim is made anywhere.
2. Prompt-injection defense is output-side (validator) + prompt hardening; a dedicated adversarial eval corpus against a real model is part of staging evaluation, not local.
3. AI cost accounting uses a versioned price snapshot (micro-USD); with the self-hosted vLLM default the unit price is 0 and the **token** caps carry the enforcement — USD caps activate when an owner sets a priced model.
4. Ack evidence for priority tasks: `ack_at` exists and is surfaced; automated Zammad-activity-based acking is a small follow-up (currently ops-visible only).
5. Local-testing note (process, not product): a partially-failed local `migrate` invocation against the shared scratch DB once left it at a 7-migration prefix, which surfaced as confusing failures in suites that use the shared DB directly; re-verified not reproducible from any test suite (all use ephemeral DBs) and unrelated to the migration files themselves.

## Rollback (per migration, all additive + default-off)

`0029` drop `conversation_mode_events`, `conversation_mode_state`, `priority_support_tasks` · `0030` drop `ai_usage_reservations`, `ai_usage_periods` · `0031` drop `b2b_tasks`, `b2b_opportunities`, `b2b_contacts`, `b2b_accounts` · `0032` drop `outbound_sends`, `outbound_drafts`, `outbound_templates`. Runtime kill switches unchanged: `POST /ops/assistant/emergency-off` (all customer automation incl. AI), `POST /ops/whatsapp/ai-policy {mode:"off"}`, `outbound_whatsapp {enabled:false}`.

## Release decision

**GO for review/merge as inert code; NO-GO for any activation** until: staging E2E receipts on a real test number (G-A/G-H/G-I physical evidence), owner approvals (ADR-015 acceptance, budgets/SLA, template copy), staffing/on-call confirmation, and a controlled-release plan per the existing production workflow.
