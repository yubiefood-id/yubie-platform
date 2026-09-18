# 22 — Marketplace/WhatsApp Data Model

## Boundaries

~~~
truth
channel
conversation
crm_bridge
customer
integration
platform
analytics
~~~

## Core tables

~~~
truth.products
truth.skus
truth.approved_facts

channel.marketplace_listings
channel.listing_health_checks
channel.outbound_clicks
channel.whatsapp_intents
channel.marketplace_imports
channel.marketplace_order_snapshots
channel.marketplace_daily_metrics

conversation.sessions
conversation.intent_events
conversation.bot_actions
conversation.handoffs

crm_bridge.lead_signals
crm_bridge.b2b_qualifications
crm_bridge.crm_links
crm_bridge.sync_attempts

customer.consent_events

platform.inbox_events
platform.outbox_events
platform.idempotency_keys
platform.audit_events
platform.operator_tasks

integration.integration_links
integration.cursor_state
integration.health
~~~

Do not mirror Chatwoot messages, CRM activity history or marketplace payment ledgers.

Prefer provider external IDs over copying PII. Raw conversations do not enter general analytics.

Bot audit stores refs, intent, policy/knowledge versions, tool IDs, result/handoff, latency/cost and timestamps.

Each marketplace import is checksum/idempotency tracked.
