# ADR-015 (PROPOSED) — WhatsApp tri-mode, channel authority and AI budgets

**Status:** PROPOSED / NON-EXECUTABLE. Requires owner, support, privacy and engineering review.  
**Date:** 2026-11-10  
**Supersedes:** None. Extends ADR-009, ADR-010, ADR-011 and the 2026-10-24 WhatsApp deferral.  
**Source baseline:** main 195e856db1f0fca813b497603e079514e3a1fdf0.

## Context and evidence

- Zammad is the designated support/inbox authority per ADR-009; Chatwoot is rollback-only, not a second active responder.
- Existing apps/bot accepts verified Zammad webhooks; apps/worker uses durable queues and provider reconciliation; BOT_ENGINE=deterministic is the production default. The Yubi V2 menu already supports B2B consent/collection and SALES_PARTNERSHIP handoff.
- On 2026-10-24, owner deferred Meta onboarding and customer-facing WhatsApp bot activation. The 2026-11-02 production receipt is for shipping hardening, not WhatsApp go-live. Implementation is not proof of current production activation.
- Current Zammad WhatsApp guidance requires Cloud API, and its regular phone onboarding says the number must not already be used in the WhatsApp Business app. Existing-app coexistence, if supported by an eligible BSP/onboarding path, is a separate decision requiring real tests.
- Zammad's documented native WhatsApp channel supports customer-initiated exchanges; external business-initiated templates require an independent, approved transport and policy.
- Meta policy permits automation within the 24-hour customer service window **with a clear human escalation path**. Business-initiated messages and out-of-window replies require approved templates and appropriate contact permission.

## Decision proposal

**One customer-facing WhatsApp identity, one inbound owner, one sending authority per message, one human support queue.**

1. **Mode D — Deterministic (default):** validated menu / FSM, zero inference tokens; authenticated product facts, conservative claims and bounded fallback.
2. **Mode A — AI-assisted opt-in:** customer explicitly selects “Tanya AI Yubi”; approved low-risk questions are answered using constrained retrieval and short output. Deterministic orchestration, risk policy, budgets, window checks, audit and delivery remain authoritative. Never set global BOT_ENGINE=legacy to implement this mode.
3. **Mode H — Human priority:** customer explicitly selects “Customer Service” (or policy forces escalation). Persist handoff and put the Zammad ticket in a priority queue with owner, next action and due timestamp. Stop both deterministic and AI customer replies on that ticket while human owns it.

Priority: emergency OFF / food-safety intake -> human takeover or explicit human request -> safety/health/refund escalation -> AI opt-in if eligible -> deterministic response. Safety incidents always create internal high-priority tasks even when customer automation is OFF; customer-facing auto messages remain disabled.

**Support agent interface:** staff reply in **Zammad agent UI**; those replies use the same WhatsApp business channel/number that originated the ticket, if officially connected. “Same WhatsApp Business” refers to the customer-visible number, **not** a promise that staff can simultaneously use the phone app. Mobile app coexistence is conditional on provider capability and UAT; no second sender is permitted.

**AI budget:** explicit enablement and limits configured server-side, default disabled until approved. Require atomic reservation before model calls keyed by contact, conversation, global account and day/month; charge/reconcile actual usage; cap input/output tokens, requests per conversation/day, concurrent requests, USD-equivalent spend and timeout. When limit is reached, use a deterministic “quota exhausted” response offering menus and human support. A normal chat must not consume AI quota.

**Outbound B2B:** separate consent- and approval-gated draft/template/outbox path. A lead record or inquiry consent is not marketing opt-in. Use vendor-approved templates and recheck consent, approval, message window, cost cap and current human ownership immediately before dispatch. Zammad native reply must never initiate an out-of-window campaign.

## Source-of-truth and ownership

| Concern | Authority |
| --- | --- |
| Customer support ticket, owner, priority and human reply | Zammad |
| Bot mode state, policy, AI quota, opt-in, audit and CRM linkage | Yubie PostgreSQL |
| Deterministic flow and approved assistant knowledge | packages/assistant + approved catalog |
| Transport and delivery truth | Meta Cloud API or approved BSP |
| B2B accounts, pipeline, owner, tasks | Yubie CRM projection; reconcile from B2B submissions |
| Payment, order and shipping status | Existing commerce authorities, not AI-generated chat |
| Product medical/nutritional claims | Verified product-truth approval, never proposal alone |

## Separate approval gate for the existing phone number

A. Dedicated API test number + native Zammad staging: preferred immediate P0 path.  
B. Existing WhatsApp Business app number + Coexistence provider: only after written provider capability proof for Indonesia, sync and reply receipts, identity mapping, privacy, rollback and exclusivity tests.  
C. API-only migration of current number: requires explicit owner approval and documented user impact. **Do not deregister or migrate an active number just to make a demo work.**

## Non-goals

No Meta credentials in repository; no implicit production activation; no bulk cold outreach, scraped contacts, autonomous price or contract approval; no duplicate Chatwoot/Zammad agents; no medical advice; no generic LLM access to outbound send credentials; no automated human reentry without explicit release.

## Decision to resolve before implementation

- Confirm if existing phone app must remain usable; determine API/BSP channel choice and named owner.
- Decide proposed budget and human SLA (do not assume values below are already approved).
- Determine privacy notice, message retention, data residency and DPA with providers.
- Approve new migration IDs against current repository HEAD and provisioned production schema.
- Obtain Zammad and WhatsApp staging evidence, safety on-call, cost alerts, rollback and exact release SHA before any AUTO rollout.

## Sources

- Repo: AGENTS.md; docs/production/ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md; ADR-010; ADR-011; docs/production/2026-10-24/WHATSAPP_DEFERRED.md.
- Zammad: https://admin-docs.zammad.org/en/latest/channels/whatsapp/index.html
- Zammad number requirement: https://admin-docs.zammad.org/en/7.1/channels/whatsapp/preparation.html
- Zammad limitations: https://admin-docs.zammad.org/en/pre-release/channels/whatsapp/limitations.html
- Meta business messaging policy: https://whatsappbusiness.com/id/policy/
- Meta pricing: https://whatsappbusiness.com/products/platform-pricing/
