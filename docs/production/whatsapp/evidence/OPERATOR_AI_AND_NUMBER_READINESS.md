# Operator-Only AI (z.ai GLM) & Number 085282141733 Readiness Receipt

**Date (UTC):** 2026-11-12 · **Branch:** `feat/whatsapp-trimode-wa00-wa07` (extends PR #89) · **Direction (owner):** AI untuk OPERATOR saja; pelanggan tetap deterministik; nomor bisnis 085282141733 menuju production.

## Stage states

| Stage | State |
| --- | --- |
| SOURCE_AUDITED | PASS |
| LOCAL_TESTS_GREEN | PASS — see commands; fake/throwing providers only, zero real model calls, zero spend |
| OWNER RUNBOOK EXECUTED (Meta/Zammad/z.ai secrets) | **BLOCKED_EXTERNAL** — `docs/production/whatsapp/NUMBER_ONBOARDING_085282141733.md` (TAHAP 0–8, Bahasa Indonesia, per-click) |
| STAGING PHYSICAL ROUND-TRIP | **BLOCKED_EXTERNAL** — owner's single manual step (runbook TAHAP 7.3) after provisioning |
| PRODUCTION | NO-GO until staging receipts + owner GO (runbook TAHAP 8) |

## Customer AI stays deterministic (M1)

Pinned by `apps/worker/tests/m1-customer-ai-hard-off.test.mjs`: fresh config → `aiAssistEnabled=false`; the switch alone (no live policy) keeps menu entry 7 a dead end with zero `ai_answer` actions; with a live policy but unconfigured provider the factory is `throwing`, the failed attempt is terminally accounted, and the customer receives the deterministic fallback. `GET /ops/whatsapp/status` now carries an explicit `customerAI` block.

## Operator AI — ops copilot (M2)

- `packages/assistant/src/ops-ai.ts`: `OpsAIProvider` port; `OpenAICompatibleOpsAIProvider` (z.ai default `https://api.z.ai/api/paas/v4`, model `glm-4.6`, any OpenAI-compatible endpoint via env); `ThrowingOpsAIProvider` **fail-closed default** (no `OPS_AI_PROVIDER` + `ZAI_API_KEY` → nothing can be called); `FakeOpsAIProvider`; softer internal validator (operator may see quoted prices; injection echoes and secret patterns still hard-rejected).
- Budget: **reuses the WA-03 atomic reservation machinery** with subject `ops:<operator>`; runtime keys `ops_ai_enabled` + `ops_ai_policy` (complete limits required; same fail-closed composition as customer AI). Accounting per operator/day + global caps; reservations/reconciliation identical.
- `POST /ops/ai/assist` (bearer `OPS_API_TOKEN`): actions `summarize_thread`, `draft_reply` (both via the least-privilege Zammad client; unknown thread → 404 with zero model calls), `runbook_qa` (grounded on compact versioned operational facts), `draft_b2b_template`. **The model has no tools and no send capability — every response is DRAFT-only** with an explicit notice. Customer-bound drafts (`draft_reply`, `draft_b2b_template`) additionally pass the hard customer claim validator.
- History + audit: migration **0034** `ops_ai_calls` stores the **redacted** draft (new `redactForLog()` in `@yubie/domain` strips Indonesian phones, long digit runs, emails); `audit_events` records operator/action/resource; tokens/cost live on the reservation row. `GET /ops/ai/status` shows policy/provider/usage + customer determinism.

## Channel bindings + number (M3)

Migration **0033** `whatsapp_channel_bindings` (declarative only — registration never activates anything) + audited `POST /ops/whatsapp/channel/register` (E164-validated, unique per provider+number) + `channels` in ops status. The number **+6285282141733** (local-format `085282141733` is rejected by the E164 schema) gets registered at first post-deploy ops call (documented) — `status: disabled` until onboarding completes.

## Validation harness (M4)

`node scripts/whatsapp/validate-channel.mjs` — server-side PASS/BLOCKED/FAIL matrix (bot health/readyz, webhook 401-unauthenticated, Zammad ping, channel binding, customer-AI-deterministic invariant, ops AI policy/provider, queue lag). Smoke-run verified (correct BLOCKED output pre-provisioning). Physical round-trip remains the owner's single manual step.

## Test evidence

~~~
node --test packages/assistant/tests/ops-ai.test.mjs        # 5 pass (factory fail-closed, validators, redaction)
node --test apps/api/tests/ops-ai.test.mjs                  # 6 pass (DB: disabled/provider/budget/validators/redaction/audit)
node --test apps/api/tests/ops-whatsapp.test.mjs            # 3 pass (incl. channel registration)
node --test apps/worker/tests/m1-customer-ai-hard-off.test.mjs  # 3 pass (DB)
~~~
Full `npm run check` result recorded in the commit/PR.

## Enabling after the runbook (post-GO, one-time ops calls)

1. `POST /ops/whatsapp/channel/register {phoneE164:"+6285282141733", status:"staged", changedBy:"owner"}` after Meta onboarding.
2. Ops AI: set `ops_ai_enabled=true` + a complete `ops_ai_policy` (suggested operator caps: ≤50 calls/operator/day, maxInput 4000, maxOutput 800, timeout 15s, global day tokens per z.ai pricing) + VPS env `OPS_AI_PROVIDER=zai`, `ZAI_API_KEY`, optional `OPS_AI_MODEL=glm-4.5-air` (cheaper). Without these the endpoint answers 503 — never silently.

## Rollback

Customer AI: unchanged default (off). Ops AI: `ops_ai_enabled=false` or remove `ZAI_API_KEY` + restart api — customers unaffected. Channel: `status:"disabled"` binding + do not deploy `--profile bot`; full rollback to the mobile app documented in the runbook (Meta re-registration, history caveat).

## Follow-ups (not blockers)

Admin web panel for the copilot (BFF pattern ready); full SOP-document grounding for `runbook_qa`; automated Zammad-activity acking for priority tasks.
