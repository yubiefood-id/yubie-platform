# Phase M2 — WhatsApp and Chatwoot Operations

## 1. Problem

WhatsApp is a core customer/B2B channel but unmanaged personal/team chats create ownership, response-time, continuity and audit problems.

## 2. Outcome

One official WhatsApp Business channel enters a shared Chatwoot inbox with named agents, routing, business hours and reliable human operation. Yubie captures provider events durably for later assistant/B2B automation.

## 3. Prerequisites

Business/operator decisions:

- official business number;
- Meta Business/WABA ownership;
- named admin/backup owner;
- team membership;
- business hours;
- customer-facing escalation expectations;
- data retention/privacy notice.

Technical:

- Chatwoot cloud or self-hosted deployment decision;
- production URL/TLS;
- email/SMTP for Chatwoot account flow if self-hosted;
- Chatwoot backup plan if self-hosted.

## 4. Recommended integration

~~~text
Meta WhatsApp Cloud API
 -> Chatwoot WhatsApp inbox
 -> Chatwoot agents
 -> Yubie webhook endpoint
~~~

Use the official Cloud API path.

## 5. Chatwoot configuration

Create:

- Yubie WhatsApp inbox;
- B2C/support team;
- Sales/B2B team;
- labels for B2B, complaint, food-safety, human-required;
- business hours;
- canned replies;
- agent ownership rules.

Avoid excessive automation before actual conversation patterns are known.

## 6. Yubie webhook boundary

~~~text
POST /v1/webhooks/chatwoot
~~~

Processing:

1. authenticate according to selected webhook integration;
2. validate content type/size;
3. persist event ID/hash;
4. respond quickly;
5. worker normalizes supported events;
6. update structured session/intent state;
7. create operator task on unsupported critical event.

Do not copy every message body into Yubie DB.

## 7. Conversation state

~~~text
chatwoot_conversation_id
chatwoot_contact_id
inbox_id
bot_mode = OFF initially
current_intent?
customer_type?
last_activity_at
crm_ref?
~~~

Chatwoot remains message-history authority.

## 8. Human workflow

Before assistant automation:

- multiple agents can see same conversation;
- assignment is clear;
- handoff works;
- no duplicate reply;
- absent agent can be replaced;
- owner can search prior conversation;
- food-safety escalation label/team works.

## 9. Reliability

Chatwoot webhook infrastructure may not provide perfect replay guarantees. Yubie therefore:

- durable-captures received events;
- processes idempotently;
- periodically reconciles critical conversation state through Chatwoot API after downtime where feasible.

## 10. Security

- WhatsApp system-user/access tokens stored outside repo;
- Chatwoot API token least privilege;
- separate staging and production inboxes;
- admin accounts protected with strong auth/MFA where supported;
- support domain not expose internal admin endpoints unnecessarily;
- backups encrypted/off-host if self-hosted.

## 11. Tests

- synthetic signed/authorized webhook;
- unauthorized webhook;
- duplicate;
- malformed;
- large payload;
- unsupported event;
- worker restart;
- Chatwoot API timeout;
- reconciliation;
- human assignment flow.

## 12. Observability

- webhook accepted/rejected;
- processing lag;
- event failures;
- Chatwoot API latency;
- unresolved conversation age;
- first human response.

## 13. Rollout

~~~text
internal test number
 -> team-only use
 -> production number with bot OFF
 -> operational observation
 -> M3 assistant shadow mode
~~~

## 14. Rollback

If Yubie integration fails, Chatwoot should still support manual human conversation.

M2 must not make the core inbox dependent on assistant availability.

## 15. GO gate

GO when human operations work end-to-end without any LLM.
