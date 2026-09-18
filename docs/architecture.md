# Architecture

The canonical architecture is [ARCHITECTURE.md](./ARCHITECTURE.md).

Yubie is **marketplace-first for D2C transactions** and **WhatsApp-first for B2C/B2B conversation**.

~~~
Yubie Web
  ├─> Shopee
  ├─> Tokopedia & Shop
  └─> WhatsApp -> Chatwoot -> Yubie Bot/Human -> CRM for qualified B2B
~~~

The local cart/checkout is prototype/reference, not a current launch dependency.

See [ADR-004](./production/ADR-004_MARKETPLACE_WHATSAPP_FIRST.md) and development documents 19–24.
