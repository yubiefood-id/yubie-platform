# Architecture & interface contracts — Yubie WhatsApp tri-mode

**Design document, not an implemented API contract.** Reconcile with exact GitHub main, Zammad staging and provider documentation before writing code.

## 1. Message topology and only-one-writer rule

~~~text
Customer (one WhatsApp number)
    |
    v
Meta Cloud API or approved Coexistence BSP (ONE primary inbound owner)
    |
    v
Zammad: official customer ticket, staff UI, human group/owner, article metadata
    |
    v
signed Zammad trigger -> apps/bot -> verified durable webhook_inbox
    |
    v
pg-boss -> apps/worker (advisory lock + persistent turn state)
    |
    v
Deterministic supervisor (policy, intent, human state, product truth)
    |             |                    |
    v             v                    v
D: deterministic A: AI opt-in         H: priority handoff
    |             |                    |
    +--> support.reply outbox          +--> Zammad group / owner / task
                     |
                Zammad REST reply
                     |
                same customer-visible WhatsApp channel
~~~

Customer-initiated replies in a supported 24-hour window go **through Zammad**. Business-initiated templates (B2B follow-ups) require a separate authorized transport but *never create a second live sender for the same message*. Synchronize message IDs and ticket history; avoid posting customer content to two independently triggering automations.

Meta Coexistence is conditional: the normal Zammad Cloud API onboarding documentation expressly disallows an app-registered number, so real BSP support and a bridge contract must be validated first. “Same number” is not proof that a support agent can use the mobile app and Zammad concurrently.

## 2. Priority and state transition precedence

Suggested conversation states: DETERMINISTIC, AI_CONSENT_PENDING, AI_OPT_IN, HUMAN_QUEUED, HUMAN_ACTIVE, RESOLVED, AI_PAUSED, OFF.

- Any text with food-safety urgency, allergy, adverse reactions or dangerous claims: internal FOOD_SAFETY escalation; highest priority; no model call.
- Existing provider humanActive or session HUMAN_ACTIVE: stop all customer automation; preserve owner and ticket.
- Explicit request “0 / customer service / bicara admin”: durable handoff and priority task; cancel unsent bot messages.
- AI selection only after explicit customer opt-in, approval of AI disclosure, per-contact quota and provider health; AI suggestions cannot change domain authority.
- Command “menu / keluar AI”: return to deterministic; do not consume model tokens for command.
- Ticket “closed” is **not** a permission to resume bot; require explicit release + cooldown + next eligible customer message (see existing ops reentry contract).
- For unknown messages, unsupported media, budget exhausted or AI timeout: deterministic fallback or human handoff, no infinite loops.

## 3. AI budget mechanics (new work)

The current deterministic engine is zero-model cost; preserve it. Proposed AI opt-in policy, **not enabled by default**:

| Limit | Suggested initial pilot (requires owner approval) |
| --- | --- |
| Max model calls per AI session | 3 |
| Max calls per contact per 24h | 5 |
| Max input tokens per call | 1,500 |
| Max output tokens per call | 250 |
| Conversation context | Last 4 approved/necessary turns, token-truncated |
| Model timeout | 8 seconds; no unbounded retries |
| Concurrent requests per contact | 1 |
| Global daily tokens / monthly USD | Operator-required values, fail closed if unset |
| Max attempts for a request | 1 generation call; transport retries separate |
| Quota after exhausted | Deterministic message + menu/CS, never silent failure |

Use UTC for global usage accounting, operator-defined timezone for local contact per-day policy, and explicit period keys. Atomic quota reservation in PostgreSQL before inference MUST include expected max input+output, persisted idempotency key and applicable counters; use SERIALIZABLE/row locking or conflict-safe upsert under concurrent requests. Abort before model call if any cap unavailable, expired or insufficient. On completion reconcile actual model-reported usage; keep a terminal failure/timeout reservation record with bounded expiry and conservative accounting; do not double-charge after retries. Global spend ceiling uses a versioned provider/model price snapshot and remains conservative if actual billed price differs. A hard cap must be enforceable independent of the LLM prompt.

**AI request is never a send command**. It returns a validated draft answer or EscalationNeeded result to the deterministic worker. The worker checks human state, support window and policy again before enqueue/send, preserving source approved facts and audit.

## 4. Domain contracts to implement

~~~ts
type CustomerMode = "DETERMINISTIC" | "AI_OPT_IN" | "HUMAN_QUEUED" | "HUMAN_ACTIVE";
type Priority = "P0_FOOD_SAFETY" | "P1_EXPLICIT_HUMAN" | "P2_B2B" | "P3_GENERAL";
type AssistantDecision =
  | { kind: "DETERMINISTIC_REPLY"; approvedTemplateId: string }
  | { kind: "AI_SUGGESTION"; responseId: string; citationRefs: string[] }
  | { kind: "HANDOFF"; destination: "CUSTOMER_SUPPORT" | "SALES_PARTNERSHIP" | "FOOD_SAFETY"; priority: Priority }
  | { kind: "NO_SEND"; reason: string };

type AIQuotaReservation = {
  requestId: string; contactKey: string; conversationRef: string;
  reservedInputTokens: number; reservedOutputTokens: number;
  estimatedCostMicrousd: number; expiresAt: string;
};
~~~

These types are proposed only. Never place provider-specific Meta IDs in core domain types; adapt at integration boundary.

## 5. Persistence contracts (proposed additive)

- channel_binding(provider, phoneNumberId, whatsappBusinessAccountId, supportChannelId, exclusiveWriter, status).
- customer_mode_state(channelBindingId, providerThreadId, mode, selectedAt, lastCustomerAt, policyVersion, ownerChangedAt).
- ai_usage_reservations(requestId unique, contactHash, thread, dayKey, monthKey, reserved, actual, model, priceVersion, state, expiresAt).
- ai_usage_periods unique(contactHash, periodKey, scope) with atomic counters, global caps in separate row.
- priority_support_tasks(ticketId, priority, group, assignedTo, nextActionAt, ackAt, resolvedAt, reason, audit).
- consent/audit and B2B opportunity link (purpose-scoped, not assumed marketing opt-in).
- outbound_template_jobs and delivery_receipts (approved template ID, version, consentRef, approvalRef, cost, idempotencyKey, providerMessageId).

Keep high-risk PII encrypted / access-restricted. Avoid raw customer text in audit logs. Add migrations only after checking latest migration IDs and rollback.

## 6. Proposed protected operator endpoints (not implemented)

- GET /ops/whatsapp/status: role-restricted status, no secrets or raw chats; includes channel owner, queue lag, AI budget usage.
- POST /ops/whatsapp/ai-policy: enable/shadow/disable and versioned limits; requires named approver and valid release SHA.
- POST /ops/whatsapp/tickets/:id/assign: explicit owner, SLA priority and human takeover, Zammad authoritative.
- POST /ops/whatsapp/tickets/:id/release: existing reentry semantics, explicit agent and cooldown.
- POST /ops/whatsapp/outbound/:id/approve: draft hash + purpose + template + recipient and expiry, no implicit send.
- POST /ops/whatsapp/emergency-off: new AI-specific hard stop; existing assistant emergency-off remains authority for customer replies.

All operator writes must pass named RBAC, audit, CSRF/session protections as applicable and revision/concurrency checks. Avoid exposing public endpoints except provider-authenticated webhooks with strict verification. Do not invent endpoint readiness just by documenting it.

## 7. Messaging / provider constraints

- Window: free-form WhatsApp replies within 24h from **last customer message**; outside window approved template only. The support worker already checks window and human ownership, and must continue rechecking before dispatch.
- Zammad documented native channel is customer-initiated, so don't pipe outbound template campaigns through Zammad articles and assume delivery.
- Provider may accept a send request but later fail. Reconcile provider receipt and status to stable delivery intent before retry.
- Avoid duplicate outbound delivery if both BSP bridge and native Zammad receive the same provider event; define one primary inbound and a passive mirror.
- Never enable Zammad's built-in AI and Yubie's custom AI on one ticket.
- B2B leads may only receive marketing when separate lawful opt-in evidence exists; a website B2B inquiry may justify a limited service response depending on policy, not indefinite promotional campaigns.

## 8. Safety and observability

Controls: webhook auth, bounded bodies, signature/replay checks, queue dedupe, optimistic concurrency on mode transitions, denial-by-default quota, low-risk allowlist, prompt injection and output grounding tests, staff approval for B2B terms, priority ticket monitors, real incident alerts, backups and drills.

Metric candidates (avoid PII labels): whatsapp_inbound_total, whatsapp_priority_open, whatsapp_priority_unassigned, whatsapp_priority_oldest_age_seconds, assistant_ai_request_total, assistant_ai_tokens_reserved, assistant_ai_tokens_actual, assistant_ai_cost_microusd, assistant_ai_quota_rejected_total, assistant_ai_handoff_total, support_provider_ambiguous_total.

## 9. Sources

- Current contracts: apps/bot/src/index.ts; apps/worker/src/assistant-handler.ts; apps/worker/src/reply-delivery-handler.ts; packages/assistant/src/deterministic/v2.ts; packages/integrations/src/zammad; apps/api/src/ops-assistant.ts.
- Zammad: https://admin-docs.zammad.org/en/latest/channels/whatsapp/index.html ; https://admin-docs.zammad.org/en/pre-release/channels/whatsapp/limitations.html
- Meta: https://whatsappbusiness.com/id/policy/
