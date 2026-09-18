# Yubie Production Handbook

## Current production model

As of 2026-09-18:

~~~
Yubie Web -> Shopee / Tokopedia & Shop
Yubie Web -> WhatsApp -> Chatwoot -> Bot/Human -> CRM for qualified B2B
~~~

Direct web checkout/payment is deferred by [ADR-004](./ADR-004_MARKETPLACE_WHATSAPP_FIRST.md).

## Current critical documents

- [Target architecture](./02_TARGET_SYSTEM_ARCHITECTURE.md)
- [Marketplace order/payment/inventory boundary](./05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md)
- [WhatsApp/B2B CRM operations](./11_B2B_CRM_AND_OPERATOR_OPERATIONS.md)
- [Roadmap](./13_PRODUCTION_DELIVERY_ROADMAP.md)
- [ADR-004](./ADR-004_MARKETPLACE_WHATSAPP_FIRST.md)
- [Development architecture](../development/19_MARKETPLACE_WHATSAPP_ARCHITECTURE.md)
- [Chatbot](../development/20_WHATSAPP_CRM_CHATBOT.md)
- [Marketplace integration](../development/21_MARKETPLACE_INTEGRATION_AND_ATTRIBUTION.md)

Older controls remain valid for product truth, food compliance, security, privacy, verified webhooks, backup/restore, observability and incident response.

Where older documents assume yubie.id must own checkout/payment/reservation, ADR-004 supersedes that assumption for the current release path.
