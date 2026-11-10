# Yubie WhatsApp AI + Priority Customer Service

**Status: DOCUMENTATION / DESIGN ONLY. This directory does not enable a production WhatsApp bot.**

This is the start-here index for engineering agents, operators, sales and the support team. Existing Zammad remains designated support authority. The 2026-10-24 deployment intentionally deferred automated WhatsApp traffic; production receipts must be checked again before claiming live operation.

## The three customer-visible choices

| Choice in the same customer-facing WhatsApp chat | Processing | Cost model | Human ownership |
| --- | --- | --- | --- |
| 1. Menu & info produk | Yubi deterministic FSM, approved knowledge | Zero inference tokens | No |
| 2. Tanya AI Yubi | Explicit opt-in; bounded model help behind policy and quota | Token-bounded, never unlimited | No, until routed |
| 3. Customer Service | Priority Zammad ticket, acknowledgement only when permitted | No LLM needed | Yes, until manually released |

**B2B & Partnership** remains an additional menu entry that collects approved lead facts and routes to sales; it must not bypass human approval for pricing, quotes, terms or outbound templates.

## Reading order

1. [Architecture decision](../ADR-015_WHATSAPP_TRI_MODE_AND_CHANNEL_AUTHORITY.md) — proposed, not accepted.
2. [GOAL_PLAN.md](./GOAL_PLAN.md) — objective, gates and work packages.
3. [AGENT_EXECUTION_PROMPT.md](./AGENT_EXECUTION_PROMPT.md) — instructions to an engineering coding agent.
4. [ARCHITECTURE_AND_CONTRACTS.md](./ARCHITECTURE_AND_CONTRACTS.md) — detailed routing, quotas, states, schema and transport.
5. [EVALUATION_AND_RELEASE_GATES.md](./EVALUATION_AND_RELEASE_GATES.md) — invariants, tests and go/no-go.
6. [OPERATIONS_DAILY_SOP.md](./OPERATIONS_DAILY_SOP.md) — sales and customer service daily workflow.
7. [ONBOARDING_AND_EMERGENCY_RUNBOOK.md](./ONBOARDING_AND_EMERGENCY_RUNBOOK.md) — operator checklist and rollback.

## Existing code to reuse, not recreate

- apps/bot/src/index.ts — verified Zammad webhook, durable inbox, queue wakeup.
- apps/worker/src/assistant-handler.ts — deterministic engine routing, sessions and handoff.
- apps/worker/src/reply-delivery-handler.ts — fresh authorization, 24-hour checks, retries and ambiguous deliveries.
- packages/assistant/src/deterministic/v2-flow.ts and v2.ts — menu plus B2B consent and sales handoff.
- packages/application/src/ports/support-conversation-provider.ts — Zammad provider-neutral interface.
- packages/integrations/src/zammad — support API adapter, ticket/article/handoff semantics.
- packages/persistence — assistant state, queues, growth leads and consent ledger.
- apps/api/src/ops-assistant.ts — protected mode control, flow version and emergency OFF.
- infrastructure/zammad/README.md — dedicated support host / real channel configuration.

## Daily business outcome

Morning: review priority Zammad tickets, food safety and SLA breach risk; assign owners, verify active AI cap, review pending B2B follow-ups.  
During business hours: deterministic handles routine queries; customers opt into bounded AI; CS ticket owns all escalations. Sales drafts are checked by humans before sending.  
End of day: close or explicitly defer tickets; check quota usage, send failures, outstanding leads, CRM sync and audit logs. Never log unredacted customer chats.

## Strong prohibitions

No dual webhook consumer and no dual active sender. Never turn on Zammad's native AI and Yubie AI against the same ticket. Never enable auto mode before exact staged acceptance, owner authorization and receipts. Never promise that API integration implies WhatsApp Business phone-app coexistence. Do not accept “same WhatsApp number” as proof that the phone app remains available. Do not publish unverified claims or credentials.

For source limitations, see [WhatsApp deferral](../2026-10-24/WHATSAPP_DEFERRED.md) and [Zammad authority](../ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md).
