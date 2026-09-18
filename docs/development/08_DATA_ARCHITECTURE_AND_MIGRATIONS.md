# 08 — Data Architecture and Migrations

**Current model:** marketplace-first commerce and WhatsApp-first CRM.

## Data ownership

| Data | Canonical owner |
|---|---|
| product truth and listing mapping | Yubie |
| WhatsApp messages/conversation | Chatwoot |
| chatbot policy/action metadata | Yubie |
| B2B qualification signal | Yubie |
| qualified sales deal/activity | CRM |
| marketplace order/payment/refund | marketplace |
| imported marketplace metrics/order projection | Yubie derived |
| physical stock/batch/QA when adopted | ERPNext |
| analytics | derived only |

## Yubie logical boundaries

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

Representative tables:

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

## Do not duplicate provider truth

Yubie does not maintain a writable mirror of Chatwoot message history, CRM sales activity, marketplace payment/refund ledger or ERP stock movement.

Store external IDs and minimum projections needed for Yubie workflows.

## Listing registry

Each public purchase target has:

~~~
listing_key
marketplace
shop_key
product_id
sku_id?
external_listing_id?
public_url
status
verified_at
verified_by
last_checked_at?
integration_provider?
~~~

The URL is server-owned. Public callers never choose arbitrary redirect targets.

## Attribution

outbound_clicks records product/SKU, destination channel, listing key, allowlisted source/campaign and timestamp. Avoid PII. Clicks represent purchase intent, not completed sales.

## Conversation data

Keep structured state such as Chatwoot conversation/contact references, current intent, bot mode, customer type, B2B qualification and CRM ref. Do not mirror raw messages into Yubie analytics.

## Marketplace projections

Only after approved API/import access:

~~~
marketplace
external_order_id
status
ordered_at
sku mapping
quantity
gross/net fields when supplied
cancel/refund fields when supplied
source_import_id
last_synced_at
~~~

Marketplace remains transaction authority.

## Migration policy

- reviewed SQL;
- no automatic production migration on app boot;
- clean bootstrap + upgrade test in CI;
- expand/contract changes;
- synthetic local data only;
- each sidecar owns its own migrations;
- destructive changes require backup/restore evidence.
