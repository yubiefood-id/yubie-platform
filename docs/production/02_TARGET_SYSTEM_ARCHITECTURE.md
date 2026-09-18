# 02 — Target System Architecture

**Current target:** marketplace-first D2C + WhatsApp-first CRM.

~~~mermaid
flowchart TB
  User --> Web["Yubie Web"]
  Web --> Router["Channel Router"]
  Router --> Shopee
  Router --> Tokopedia["Tokopedia & Shop"]
  Router --> WA["WhatsApp"]
  WA --> Chatwoot
  Chatwoot --> Core["Yubie Conversation Core"]
  Core --> DB[("Yubie PostgreSQL")]
  Core --> CRM["Qualified B2B CRM"]
  Core --> Truth["Approved Product Truth"]
  Worker["Worker / pg-boss"] --> DB
  Worker --> CRM
  MarketData["Marketplace API/Export"] --> Worker
~~~

Yubie Web owns discovery and routing.

Marketplaces own marketplace transaction execution.

Chatwoot owns conversation/inbox operations.

Yubie owns bot policy, listing registry, lead qualification, product truth and integration reliability.

CRM owns qualified B2B sales work.

ERPNext may later own physical operations; it is not a prerequisite for the current conversion path.

Direct web payment/order/reservation is deferred by ADR-004.
