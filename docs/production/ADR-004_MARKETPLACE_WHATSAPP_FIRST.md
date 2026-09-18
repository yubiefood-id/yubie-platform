# ADR-004 — Marketplace-First Commerce and WhatsApp-First Conversation

**Status:** Accepted for current business model
**Date:** 2026-09-18
**Supersedes for the current launch path:** direct-web checkout as a launch-critical capability.

## Context

Yubie's actual sales model is:

- D2C transactions occur primarily on marketplaces such as Shopee and Tokopedia & Shop;
- the Yubie website is the owned discovery, education, SEO and channel-routing surface;
- WhatsApp is the primary conversational channel for product questions, B2C assistance and B2B qualification;
- Yubie wants a CRM-aware chatbot with reliable human handoff;
- direct payment collection on yubie.id is not required to validate or operate the current business model.

Building a full first-party checkout, payment, reservation and fulfilment stack before it is needed would add cost and failure modes while duplicating marketplace capabilities.

## Decision

1. **Marketplace-first D2C.** Yubie Web sends purchase intent to approved marketplace listings. It does not accept customer payment in the current release path.
2. **WhatsApp-first conversation.** Official WhatsApp Business/Cloud API terminates in Chatwoot. Chatwoot owns conversation history/inbox workflow.
3. **Yubie Conversation Core.** Yubie owns bot policy, intent routing, approved product knowledge, marketplace-link tools, lead signals, B2B workflow and audit.
4. **B2B CRM is separate from B2C support.** Ordinary B2C contacts remain in Chatwoot. Qualified B2B/partnership opportunities may be projected to a CRM.
5. **Marketplace systems own transaction execution.** Marketplace seller systems own marketplace order/payment/refund states. Yubie may later ingest read-only operational/reporting projections.
6. **No scraping.** Marketplace automation must use approved APIs, webhooks, seller exports or explicit operator imports.
7. **Direct commerce is deferred.** Existing cart/checkout code remains prototype/reference until a future ADR proves a first-party checkout creates enough business value to justify its operational burden.
8. **ERP integration is problem-triggered.** ERPNext remains a candidate for stock/batch/QA/manufacturing/accounting, but web-to-ERP reservation is not launch-critical while marketplace checkout is the transaction boundary.

## Consequences

The highest-priority backend becomes:

~~~
website routing + attribution
WhatsApp/Chatwoot integration
chatbot policy + approved knowledge
B2B lead qualification
CRM projection
marketplace listing registry
analytics/reconciliation imports
integration reliability
~~~

The following are no longer P0:

~~~
web cart authority
first-party order creation
Midtrans/Xendit integration
web payment webhooks
web inventory reservation saga
custom fulfilment engine
Medusa / Hyperswitch / Karrio
~~~

## Review trigger

Revisit direct commerce when measurable evidence shows marketplace fees, attribution limits, customer experience, B2B requirements or operational constraints justify owning checkout.
