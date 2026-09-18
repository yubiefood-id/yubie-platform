# Yubie Platform

Production-oriented monorepo for **Yubie — Nourish Naturally**, an Indonesian food-tech startup translating local sweet potatoes into modern food products and ingredient formats.

## Current business model

Yubie's current digital operating model is **marketplace-first for D2C** and **WhatsApp-first for assisted B2C and B2B**.

~~~text
Discovery / SEO / Campaign
          |
          v
       yubie.id
          |
    +-----+-----------------------+
    |                             |
    v                             v
Shopee / Tokopedia & Shop      WhatsApp
marketplace checkout              |
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

Yubie does not currently need to own customer payment or first-party D2C checkout. See `docs/production/ADR-004_MARKETPLACE_WHATSAPP_FIRST.md`.

## Workspace

| Path | Responsibility |
| --- | --- |
| `apps/web` | Public brand, product discovery, recipes, roots, B2B, marketplace/WhatsApp routing |
| `apps/api` | Current Fetch-compatible backend boundary; target home for redirects/webhooks/internal integration APIs |
| `apps/worker` | **Target** durable async jobs, reconciliation and provider delivery |
| `packages/domain` | Pure Yubie domain language and invariants |
| `packages/validation` | Zod schemas at untrusted boundaries |
| `packages/application` | **Target** use cases and inward-facing ports |
| `packages/persistence` | **Target** PostgreSQL repositories and migrations |
| `packages/integrations` | **Target** Chatwoot, CRM, marketplace and messaging adapters |
| `packages/assistant` | **Target** chatbot policy, knowledge/tool contracts and evaluations |
| `packages/commerce` | Current preview commerce compatibility boundary; not production payment authority |
| `packages/ui` | Shared design tokens and primitives |
| `infrastructure` | Environment and deployment contracts |
| `docs/development` | Engineering architecture and execution handbook |
| `docs/production` | Production operations, security and go-live handbook |

## Product truth

The product program combines Yubie Flour, Yubie Shake/puree-instant work and Yubie Ppang/goguma-ppang work. Research proposals, prototype tests and planned certifications are inputs to product development, **not automatic permission to publish commercial claims**.

Public nutrition, health, shelf-life, certification, allergen and regulatory claims require explicit evidence and approval for the exact sellable product/specification.

## Local development

Prerequisites:

~~~bash
node --version   # >= 22.13
npm --version    # >= 11
npm ci
npm run dev
~~~

Standalone API:

~~~bash
npm run dev:api
~~~

Current quality gate:

~~~bash
npm run check
~~~

Future phases add PostgreSQL, worker and integration profiles while preserving a lightweight fake-provider default.

## Engineering execution

Read in order:

1. `AGENTS.md`
2. `DESIGN.md`
3. `docs/DEVELOPMENT_GOALS.md`
4. `docs/ARCHITECTURE.md`
5. `docs/development/README.md`
6. `docs/development/phases/README.md`
7. `docs/production/README.md`
8. `docs/production/vps/README.md`

The current delivery sequence is M0–M8: channel/product-truth correction, marketplace routing, WhatsApp/Chatwoot, safe assistant, B2B CRM, marketplace intelligence, optional marketplace APIs, problem-triggered ERP, and only then a new decision on first-party commerce.
