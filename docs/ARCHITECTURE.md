# Yubie Platform Architecture

**Current channel decision:** marketplace-first D2C and WhatsApp-first conversation.

Yubie is not currently an e-commerce payment processor. The owned platform is the discovery, product-truth, conversational CRM, B2B qualification, attribution and integration layer around marketplace transactions.

## 1. Problem-ranked architecture

| Rank | Business problem | Engineering response |
|---|---|---|
| P0 | Customers discover Yubie on owned/social channels but buy on marketplaces | Route reliably to approved Shopee/Tokopedia & Shop listings and measure outbound intent. |
| P0 | WhatsApp is the primary question/B2C/B2B channel | Use official WhatsApp Cloud API through Chatwoot with bot + human handoff. |
| P0 | A chatbot can damage trust if it invents health claims, price, stock or policies | Build a Yubie-owned policy/knowledge/tool layer; the LLM is not a source of truth. |
| P1 | B2B opportunities get lost in chat | Classify B2B intent, persist lead signal, assign owner and sync qualified opportunities to CRM. |
| P1 | Product facts and purchase links drift across web/chat/marketplaces | Maintain one Yubie product/listing registry and approved product-truth projection. |
| P1 | Offsite conversion makes attribution incomplete | Track server-side outbound clicks/WhatsApp starts and ingest marketplace reports/API metrics without claiming false user-level attribution. |
| P2 | Manual multi-marketplace operations become painful | Add approved marketplace APIs/imports and later ERP/omnichannel automation only when measured operational pain exists. |
| Deferred | First-party checkout/payment | Build only after a new ADR proves it is required. |

## 2. System context

~~~mermaid
flowchart TB
  Visitor["Visitor / Customer / Business Buyer"] --> Web["Yubie Web"]
  Web --> Content["Product discovery · recipes · roots · B2B"]
  Web --> Router["Channel Router / Attribution"]
  Router --> Shopee["Shopee listing"]
  Router --> Toko["Tokopedia & Shop listing"]
  Router --> WA["WhatsApp"]
  WA --> CW["Chatwoot"]
  CW --> Bot["Yubie Conversation Core"]
  Bot --> Knowledge["Approved Product Knowledge"]
  Bot --> Listing["Marketplace Listing Registry"]
  Bot --> CRM["B2B CRM"]
  Bot --> Human["Human Agent"]
  API["Yubie Core API"] --> DB[("PostgreSQL")]
  Worker["Yubie Worker"] --> DB
  Bot --> API
  Router --> API
  Worker --> CRM
  Marketplace["Marketplace API / Seller Export"] --> Worker
  Worker --> Analytics["Derived Channel Analytics"]
~~~

## 3. Repository/container view

~~~
apps/web
  owned discovery + marketplace/WhatsApp CTAs

apps/api
  public redirects, lead capture, Chatwoot webhook boundary,
  internal bot/tool endpoints, integration queries

apps/worker
  async CRM sync, conversation jobs, imports/reconciliation

packages/domain
packages/application
packages/persistence
packages/integrations
packages/assistant
packages/validation
~~~

Application, persistence, integrations, assistant and worker are target additions, not claims about current implementation.

## 4. Canonical ownership

| Data | Canonical owner |
|---|---|
| Approved product facts and claim visibility | Yubie |
| Public marketplace listing mapping | Yubie |
| Website outbound-click event | Yubie |
| WhatsApp conversation/messages | Chatwoot / official WhatsApp channel |
| Bot policy, tool decisions, handoff audit | Yubie |
| B2C support workflow | Chatwoot |
| Qualified B2B company/deal/activity | CRM |
| Original B2B lead signal/source attribution | Yubie |
| Marketplace order/payment/refund execution | Marketplace |
| Marketplace sales aggregate/import | Marketplace source, Yubie derived projection |
| Physical stock/batch/QA when ERP is adopted | ERPNext |
| Analytics dashboards | derived only |

## 5. Website purchase flow

~~~
Product page
  -> Choose marketplace
      -> /go/{channel}/{listingKey}
          -> validate allowlisted listing
          -> record non-PII outbound intent
          -> redirect to marketplace
  -> Ask on WhatsApp
      -> /go/whatsapp/{intentKey}
          -> record source/product/campaign
          -> official click-to-chat
~~~

No user-controlled open redirect is allowed.

## 6. WhatsApp flow

~~~
WhatsApp Cloud API
 -> Chatwoot
 -> signed webhook
 -> durable Yubie inbox
 -> worker
 -> intent/policy router
 -> approved knowledge + deterministic tools
 -> reply OR human handoff
 -> optional B2B CRM projection
~~~

The bot must not invent medical/health claims, marketplace price, stock, certification or order state.

## 7. Marketplace integration maturity

**L0:** verified public listing URLs + Seller Center.
**L1:** deterministic seller CSV/report import.
**L2:** approved read APIs/webhooks.
**L3:** write APIs for catalog/stock only after operational need and contract tests.

For Tokopedia & Shop, verify merchant migration/onboarding before selecting Tokopedia legacy or TikTok Shop APIs. Shopee automation uses approved Shopee Open Platform access only. Do not scrape.

## 8. Reliability

~~~
local DB -> transactional outbox -> pg-boss -> provider
provider webhook -> verify -> durable inbox -> worker -> reconcile
~~~

## 9. Direct commerce

Existing cart/checkout/provider code is a safe prototype but is **not the current production north star**. Do not add real payment credentials until ADR-004 is superseded.
