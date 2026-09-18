# 19 — Marketplace-First / WhatsApp-First Architecture

## Core thesis

Yubie's owned platform maximizes **trust, routing, conversation and learning**. Marketplaces maximize **transaction execution**.

## Customer journeys

### D2C direct
Search/social -> yubie.id -> product discovery -> marketplace -> checkout.

### D2C assisted
yubie.id -> WhatsApp -> approved answer/recommendation -> marketplace links -> checkout.

### B2B
website/social/referral -> WhatsApp -> progressive qualification -> human/sales -> CRM -> sample/quote/product development.

### Complaint/safety
WhatsApp -> human handoff -> structured case -> food-safety process if applicable.

## Components

~~~
apps/web
  discovery + purchase options + WhatsApp

apps/api
  redirects + Chatwoot webhook + assistant tools + imports

apps/worker
  bot jobs + CRM sync + marketplace imports/reconciliation

packages/assistant
  intent + policy + retrieval + tools + evaluation

packages/integrations
  chatwoot + crm + marketplace + analytics

PostgreSQL
  listing registry + attribution + bot/lead metadata + reliability
~~~

## Boundary rationale

Chatwoot is conversation infrastructure, not product truth/marketplace reconciliation.

Ordinary B2C remains in Chatwoot; qualified B2B enters CRM.

Marketplace integration starts with links/reports because that solves early operational needs without waiting for partner API approval.
