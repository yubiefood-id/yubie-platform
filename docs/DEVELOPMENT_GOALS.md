# Yubie Platform Development Goals

**Status:** canonical current direction
**Last reviewed:** 2026-09-18

## Mission

Build Yubie into an owned digital growth and operating layer that makes product discovery trustworthy, sends purchase intent to the marketplaces where Yubie actually sells, turns WhatsApp conversations into fast customer assistance and qualified B2B opportunities, and creates useful business data without prematurely rebuilding marketplace commerce infrastructure.

## Current channel model

~~~
Discovery / SEO / social
        |
        v
     yubie.id
        |
   +----+--------------------+
   |                         |
   v                         v
Marketplace purchase      WhatsApp
Shopee / Tokopedia        questions / B2C / B2B
                             |
                             v
                          Chatwoot
                             |
                    Bot <-> Human
                             |
                    qualified B2B
                             |
                             v
                            CRM
~~~

## North-star outcomes

1. approved product facts;
2. correct live marketplace destination;
3. measurable outbound purchase intent;
4. contextual WhatsApp start;
5. safe routine automation from approved knowledge;
6. reliable human handoff;
7. durable B2B qualification and CRM projection;
8. reproducible marketplace sales reporting;
9. graceful degradation when CRM/analytics integrations fail.

## Priority

**P0:** channel correctness, WhatsApp operations, bot trust.

**P1:** B2B pipeline, listing truth, cross-channel attribution.

**P2:** marketplace API and ERP automation only when access/volume justifies it.

## Metrics

Web/channel: product->marketplace CTR, product->WhatsApp, listing failure.

WhatsApp: first response, safe bot containment, handoff reason, unresolved age, B2B qualification.

Marketplace: seller-reported/API orders, revenue, cancellation/returns and listing performance.

A website click is not a marketplace order unless a legitimate linkage exists.

## Engineering outcomes

- listing registry + tracked redirects;
- official WhatsApp/Chatwoot;
- signed webhook inbox;
- assistant policy/knowledge/tools;
- human handoff;
- durable B2B lead signal + CRM sync;
- PostgreSQL/outbox/pg-boss for Yubie-owned state;
- marketplace import/API adapters;
- fake-provider and failure contract tests.

## Deliberate non-goals

- first-party web payment/order;
- payment gateway;
- web stock reservation;
- Medusa/Hyperswitch/Karrio;
- customer loyalty/subscriptions;
- copying every B2C chat into CRM;
- autonomous AI for refunds, food safety, medical/health claims or contractual commitments.

## Phases

~~~
M0 Channel correction
M1 Marketplace routing + attribution
M2 WhatsApp/Chatwoot
M3 Safe chatbot
M4 B2B CRM
M5 Marketplace report intelligence
M6 Marketplace APIs if justified
M7 ERP/back office if justified
M8 Direct commerce only after new ADR
~~~
