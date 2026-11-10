> **Historical architecture note (2026-11-10):** The legacy Chatwoot-as-primary description below predates the accepted Zammad authority (ADR-009) and does not describe the current designated support owner. For future implementation use [WhatsApp tri-mode program](whatsapp/README.md), [ADR-009](ADR-009_ZAMMAD_SUPPORT_AUTHORITY.md), [proposed ADR-015](ADR-015_WHATSAPP_TRI_MODE_AND_CHANNEL_AUTHORITY.md) and the 2026-10-24 production bot deferral. No live channel activation is implied.

# 11 — WhatsApp, B2B CRM and Operator Operations

WhatsApp is the primary conversational front door.

Chatwoot is the team inbox and B2C support system. Yubie Conversation Core classifies intent, provides safe automation and hands off. Qualified B2B opportunities are projected to CRM.

## Operator ownership

~~~
Chatwoot
  routine B2C / support / bot handoff

CRM
  qualified B2B companies, contacts, deals, follow-ups

Yubie
  integration errors
  qualification bridge
  marketplace listing health
  bot policy/knowledge
  food-safety escalation
~~~

Do not build a duplicate giant operator UI.

Every qualified B2B lead has an owner, stage, next action, due time, conversation reference and product/use-case context.

CRM outage leaves the Yubie lead queued for sync.

Complaint/safety conversations cannot be fully auto-resolved by the chatbot.
