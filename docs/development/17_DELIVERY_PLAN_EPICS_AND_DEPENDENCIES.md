# 17 — Marketplace/WhatsApp Delivery Plan

## Principle

Solve the actual business bottleneck in descending impact.

## M0 — Channel correction

- approve ADR-004;
- document canonical owners;
- inventory marketplace listings;
- disable/de-emphasize cart/checkout;
- define WhatsApp Business ownership.

Exit: the site no longer implies Yubie processes a purchase when it does not.

## M1 — Marketplace routing + attribution

- listing registry;
- purchase options;
- allowlisted tracked redirect;
- WhatsApp redirect;
- click events;
- link-health checks.

Exit: each available product has a verified destination.

## M2 — WhatsApp/Chatwoot

- official WhatsApp Cloud API;
- Chatwoot inbox/teams/business hours;
- signed webhook inbox;
- human workflow.

Exit: reliable receive/respond and replay-safe provider handling.

## M3 — Safe chatbot

- intent taxonomy;
- approved knowledge;
- tool gateway;
- response policy;
- marketplace-link tool;
- handoff;
- evaluations.

Rollout: shadow -> suggested replies -> low-risk auto-reply.

## M4 — B2B CRM

- qualification;
- durable lead;
- owner/SLA;
- replaceable CRM adapter;
- sample/quote/development routing.

## M5 — Marketplace reporting

- official seller report import;
- SKU/channel mapping;
- sales/cancel/return aggregates;
- reproducible dashboards.

## M6 — Marketplace APIs

Only after approved access and measured automation value. Prefer read integration before write.

## M7 — ERP/back office

Only when physical operations justify it.

## M8 — Direct commerce

Requires a new ADR.

~~~mermaid
flowchart LR
 M0 --> M1 --> M2 --> M3 --> M4
 M1 --> M5 --> M6
 M4 --> M7
 M6 --> M7
 M7 --> M8
~~~
