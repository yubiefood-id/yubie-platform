# GOAL PLAN — WhatsApp Deterministic + Bounded AI + Priority Human Support

**Mission ID:** YUBIE-WA-TRIMODE-2026-11  
**Status:** PLAN ONLY — release authorization required; no live WhatsApp state inferred from code.  
**Baseline:** main 195e856db1f0fca813b497603e079514e3a1fdf0 (2026-11-02); confirm fresh HEAD at execution.  
**Primary authority:** ADR-009 (Zammad), ADR-010 (provider), ADR-011 (deterministic). Proposed change: ADR-015; do not silently override accepted ADRs.

## 0. Choices → Plan → Workflow

**Choice 1:** Extend the existing Yubi V2 FSM, not replace it. Default deterministic messages cost **zero inference tokens**.  
**Choice 2:** Opt-in AI is a bounded, low-risk helper inside the *same deterministic supervisor*, not a globally enabled legacy AI bot.  
**Choice 3:** “Customer Service” is a **priority human service queue in Zammad**; assigned staff reply as human agents through that WhatsApp channel, not a separate number. Mobile-app co-use is not guaranteed.  
**Choice 4:** Separate B2B pipeline and approved outbound template transport from customer reply; no speculative proactive messaging.  
**Choice 5:** Deploy in staging first and preserve off / shadow / suggestion / auto progression with independent approval.

## 1. What exists, and what is not yet proven

| Finding | Current source / evidence | Consequence |
| --- | --- | --- |
| Zammad designated production support inbox | AGENTS.md, ADR-009, infrastructure/zammad | Reuse Zammad agent UI and customer routing |
| Deterministic-v2 already has menus, B2B consent and SALES_HANDOFF | packages/assistant/src/deterministic/v2-flow.ts and v2.ts | Add AI & CS selection without rewriting current nodes |
| Bot webhook auth, idempotent durable inbox | apps/bot/src/index.ts | Keep existing inbound pattern |
| Worker retry, reconciliation and human takeover | apps/worker/src/reply-delivery-handler.ts | Reuse but extend tests and AI reservation state |
| Runtime OFF/shadow/suggestion/auto and emergency OFF | apps/api/src/ops-assistant.ts | Preserve semantics; mode changes require audited operator |
| B2B form stores consent and lead + outbox event | growth-forms.ts, 0010_growth_and_consent | Build event consumer/CRM task; no universal marketing consent |
| Production bot deferral documented on 2026-10-24 | docs/production/2026-10-24/WHATSAPP_DEFERRED.md | No claim that bot currently handles live inbound |
| 2026-11-02 release deployed shipping hardening | docs/production/2026-11-02/DEPLOYMENT_RECEIPT.md | This release does not clear WhatsApp acceptance |
| Zammad native WhatsApp Cloud API | official Zammad docs | Dedicated test channel easiest; app Coexistence separate discovery |

## 2. Product requirements and UX state machine

Start message (approved copy is a separate product approval):

1. **Produk & Pesanan** → deterministic catalog, preparations, order support (facts approved and gated).
2. **Tanya AI Yubi** → consent/disclosure + short AI Q&A with capped quota and clear “kembali ke menu”.
3. **Customer Service (Prioritas)** → Zammad escalation; human owns ticket until explicit release.
4. **Reseller, Grosir & Partnership** → existing B2B qualification and SALES_PARTNERSHIP queue, then CRM task.
0. **Hubungi Tim** → always accessible even if AI quota exhausted.

“Priority” means prioritized for **triage**, not promised immediate response or special treatment without an approved SLA. Food safety / allergy / adverse reactions outrank ordinary sales priority and route to the existing food safety destination.

**State invariant:** deterministic mode remains available without AI; an AI request cannot bypass emergency OFF, human ownership, policy, 24-hour reply window or verified product truth.

## 3. Measurable success goals (initial thresholds proposed, not approved)

| Goal | Initial acceptance target |
| --- | --- |
| G-A: reliable inbound | Genuine number-to-number message received, ticket created, processing trace and delivery receipt recorded |
| G-B: deterministic correctness | 0 LLM calls in deterministic test suite; 100% replies from approved versions |
| G-C: AI opt-in | 0 AI calls without explicit opt-in; 0 calls over hard token/request/spend caps under concurrency |
| G-D: human ownership | 0 bot customer replies after confirmed HUMAN_ACTIVE; food safety immediate internal escalation |
| G-E: priority operations | Each priority ticket has an owner, priority, next action/due time and acknowledgement evidence |
| G-F: B2B | 100% qualified leads mapped to one CRM opportunity/task or durable retry queue |
| G-G: messaging compliance | 0 proactive messages without purpose-scoped consent, valid approved template and approval |
| G-H: reliability | 0 duplicate customer messages in acceptance fixtures + real traffic rehearsal; ambiguous sends reconciled, not blindly replayed |
| G-I: rollback | Emergency OFF tested under load; rollback restores deterministic/human queue without losing tickets |
| G-J: observability | Dashboards for AI usage/cost, queue lag, unassigned priority tickets, handoff times, delivery failure and alerts |

Proposed operator SLA values should be explicitly approved before customer-facing promises. Start with internal triage goals (for instance P0 safety within 15 min during staffed hours; P1 explicit human request within 1 hour; P2 routine next business day). Do not claim 24/7 human coverage.

## 4. Implementation order with acceptance gates

### WA-00 — Read-only baseline & owner decisions (P0)
- Inspect exact main SHA, release image digest, deployed migration set, Zammad version, bot profile, worker support provider, assistant runtime mode, existing trigger identities; redact secrets.
- Test DNS/TLS to support and bot endpoints; verify production vs staging; do not infer from README alone.
- Record phone ownership, current mobile app use, WABA/phone-number identity, BSP and coexistence eligibility.
- Read actual approved catalog and legal claims; choose privacy retention, human support schedule and named on-call.
- **Gate:** evidence ledger + owner-signed architecture/phone decision; no production mutation.

### WA-01 — Native Zammad test-number vertical slice (P0)
- Onboard a *separate* eligible Cloud API test/staging number in Meta and Zammad per current docs.
- Provision real webhook verification, Zammad article type, support and sales/food-safety group IDs. Deploy apps/bot in staging only.
- Test inbound -> Zammad article -> signed bot trigger -> durable inbox -> pg-boss -> deterministic response -> Zammad outgoing article -> actual WhatsApp receipt.
- Validate duplicates, malformed signatures, 24-hour window expiry, agent takeover, outage, queue restart, unknown media, and event reconciliation.
- **Gate:** physical phone-to-phone receipts with correlation IDs, not fixture-only PASS.

### WA-02 — Three-mode selection & priority human queue (P0)
- Extend deterministic-v2 menu nodes, validated transitions and explicit opt-in/out; preserve v1 compatibility and current B2B routing.
- Add a persisted *mode-per-conversation* state separate from Zammad human ownership, with operator-safe reset and audit.
- On CS selection, perform durable internal handoff to Zammad, assign group/priority and named human owner or unassigned dispatch queue; create follow-up due time and warn operator about backlog.
- Stop every pending bot-generated customer send when human takeover begins, including in-flight reconciliations; internal food-safety notifications may continue.
- Human reply goes through Zammad's connected WhatsApp channel; do not assume mobile phone app works simultaneously.
- **Gate:** 0 bot replies while human active; re-entry only after explicit operator release, cooldown and customer input.

### WA-03 — AI bounded opt-in and knowledge safety (P1)
- Introduce a provider-neutral AIAssist port invoked **only** from the deterministic supervisor when selected and policy allows.
- First deploy SHADOW with calls disabled or tightly isolated; run curated evaluation set.
- Add short context, approved retrieval, input sanitization, tool allowlist, structured model output validator and claim verifier. Reject medical/nutrition speculation, stale prices, payment/inventory fabrication and prompt injections.
- Implement atomic usage reservation with cost estimates under max_in, max_out, max_calls_conversation, max_calls_contact_day, max_total_tokens_day/month, max_usd_month, timeout and concurrency. Cap response length; never call model after a denied reservation. Reconcile actual billed usage and refund unused reservations.
- Introduce deterministic fallback/CS route when exhausted, delayed or uncertain.
- **Gate:** 0 over-budget calls in concurrency tests, 0 unsupported product claims in evaluation suite, all usage debited exactly once, clear opt-out.

### WA-04 — B2B queue and CRM projection (P1)
- Consume growth.b2b_lead_created idempotently from existing transactional outbox. Preserve source, purpose-scoped consent and attribution.
- Tie incoming B2B WhatsApp qualification to canonical account/contact/opportunity and assign sales owner/stage/next action due.
- Do not silently rewrite website as full CRM: add minimal ops views or link existing support UI; reconcile source event from Zammad and web.
- **Gate:** lead survives CRM outage and replays to exactly one opportunity, no private chat in logs.

### WA-05 — Approved outbound B2B gateway (P2)
- Add independent provider transport for Meta approved templates (not a workaround through Zammad native channel).
- All drafts require consent evidence, approved template/version, seller review, amount/frequency cap, sender uniqueness and purpose. Recheck immediately before job dispatch and on retry.
- Reconcile provider ID/status from callbacks and show actual delivered/failed/ambiguous, including per-message cost.
- **Gate:** no send on opt-out, expired approval or missing template; ambiguous network errors never trigger unverified duplicate sends.

### WA-06 — Existing-number coexistence pilot (separate owner gate, P2)
- Evaluate certified vendor path against existing app and number **without deregistering the business app**.
- Map inbound, outbound, human replies and provider IDs to Zammad exactly once; isolate any adapter as additive and feature-flagged.
- Prove mobile application state, app↔API sync, delivery, 24-hour windows, order, failure and rollback on real devices. If unavailable, keep original number unaffected and maintain staging test number.
- **Gate:** owner accepts documented loss/change to app behavior or provider-compatible coexistence proven; no unsupported dual writers.

### WA-07 — Production hardening & staged release (P2)
- Staging -> shadow -> suggestion -> approved deterministic AUTO -> selected AI helper. Activate only after all evidence and human staffing, cost alarms, backups, rollback.
- Preserve iPaymu/checkout admission, shipping mode and payment reconciliation. Messaging release cannot accidentally activate commerce.
- **Gate:** release SHA, artifact digest, relevant CI and deployment receipt, explicit owner GO, rollback drill, SMS/phone fallback for urgent safety cases.

## 5. Candidate data model (not migrations yet)

- whatsapp_channel_bindings: provider + phone_number_id + WABA ID + support channel/inbox + exclusive writer + status.
- conversation_mode_state: contact/channel/thread, deterministic/ai_opt_in/human, chosen_at, last_customer_at, transition provenance, version.
- ai_usage_reservations and ai_usage_ledger: hashed contact key, period, request idempotency, reserved/actual tokens, model price snapshot, cost, refunded delta, status, expiry.
- priority_support_tasks: Zammad ticket id + group/priority, reason, owner, due, acknowledgement and resolved timestamps; human state remains Zammad source of truth.
- b2b_accounts, b2b_contacts, b2b_opportunities, b2b_tasks, lead provenance, mandatory next_action.
- messaging_consent, suppressions, template_registry, outbound_drafts, approvals, sends, receipts. Consent separated by purpose/channel, with revocation precedence.

Reuse currently deployed migrations 0001–0028; check HEAD and migration sequencing before assigning 0029+. Only additive, backward-compatible changes with rollback and data retention strategy.

## 6. Engineering work packages and code boundaries

| Change | Correct layer |
| --- | --- |
| New menus, safety precedence, deterministic fallback | packages/assistant/src/deterministic |
| Mode transition, risk invariants and approved knowledge | packages/domain + packages/application + packages/assistant |
| Opt-in and quota Zod schemas | packages/validation |
| Persisted state and budget reservations | packages/persistence |
| Public provider webhooks / protected ops endpoints | apps/bot or apps/api as existing routing dictates |
| Async AI, CRM sync, outbound dispatch, reconciliation | apps/worker |
| Zammad ticket priority, article and human state | packages/integrations/src/zammad |
| Approved Meta/BSP provider adapter (after owner selection) | packages/integrations/src/meta or bsp |
| Minimal operator dashboard/SLA controls | apps/admin, without duplicating Zammad ticket UI |
| Tests and UAT receipts | package tests + docs/production/whatsapp release evidence |

Do not create an independent chatbot monolith; do not change SUPPORT_PROVIDER in production as a side effect of code merge.

## 7. External blockers and responsibilities

| Person / role | Must provide |
| --- | --- |
| Yubie owner | Phone-app preservation decision, acceptance, AI spend and human SLA limits, WhatsApp send authorization |
| Meta Business admin | WABA/phone ID, verified provider connection, test number, compliant templates, token in secret store |
| Zammad admin/DevOps | Actual channel, webhook signing, ticket grouping, article type, dedicated service user, agent permissions |
| Sales/CS lead | Named queue owners, hours, response cadence, contract/MOQ approvers, out-of-hours escalation |
| Product/R&D and legal | Verified claims, knowledge approvals, consent text/retention, complaints and food-safety SOP |
| Engineering release owner | CI evidence, migrations, staging receipts, graph:context, deploy artifact and emergency rollback |

## 8. Non-goals, risks and rollback

- Not: mass unsolicited outreach, raw chat scraping, model autonomy over outbound send credentials, unsupported product health advice, automatic staff takeover reversal, changing payment/provider secrets, or changing the live phone number to run tests.
- Kill switch: existing POST /ops/assistant/emergency-off for customer automation; maintain food-safety internal queue. New AI-specific OFF switch must be independently testable and cannot enable global AUTO.
- Failure behavior: AI/provider unavailable -> deterministic fallback/human escalation; Zammad unavailable -> durable queue and retry, never silently send directly as second writer; Meta/BSP ambiguity -> reconcile receipt before retry.
- Release receipts must distinguish CODE_COMPLETE, STAGING_E2E_PASS, OWNER_APPROVED and PRODUCTION_LIVE.

## 9. References

Internal: AGENTS.md; ADR-009/010/011; docs/production/2026-10-24/WHATSAPP_DEFERRED.md; docs/production/yubi-v2/{ARCHITECTURE,CURRENT_STATE,OPERATOR_ACTIONS}.md; infrastructure/zammad/README.md.  
External: https://admin-docs.zammad.org/en/latest/channels/whatsapp/index.html ; https://admin-docs.zammad.org/en/7.1/channels/whatsapp/preparation.html ; https://admin-docs.zammad.org/en/pre-release/channels/whatsapp/limitations.html ; https://whatsappbusiness.com/id/policy/ ; https://whatsappbusiness.com/products/platform-pricing/ .
