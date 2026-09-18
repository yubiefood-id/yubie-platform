# 15 — Analytics, Observability and Feature Flags

## Two kinds of truth

Because checkout happens offsite, separate:

**Owned behavior:** page/product views, marketplace clicks, WhatsApp starts, bot/human events and B2B qualification.

**Marketplace outcomes:** orders, revenue, cancellation/return, promotion and listing statistics.

Do not claim deterministic conversion from a click unless the marketplace actually provides a valid linkage.

## Event catalog

~~~
product_view
marketplace_option_view
marketplace_click
whatsapp_click
whatsapp_conversation_started
assistant_intent_classified
assistant_answered
assistant_handoff
b2b_detected
b2b_qualified
crm_sync_succeeded
crm_sync_failed
marketplace_import_completed
marketplace_import_failed
listing_health_failed
~~~

No raw WhatsApp text in broad analytics.

## Attribution

Use allowlisted source/campaign/product/root/marketplace and an anonymous correlation token only where permitted.

## Operational observability

Monitor Chatwoot webhook lag/failure, bot processing latency/errors, CRM queue, broken listing URLs, marketplace import freshness, rate limits and dead-letter/operator tasks.

## Feature flags

Control bot auto-reply per intent, CRM sync, marketplace API sync, listing destination and model/knowledge version. Food-safety and explicit-human-request intents remain human-first.
