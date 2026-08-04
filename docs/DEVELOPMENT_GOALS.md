# Yubie Platform Development Goals

**Status:** canonical product and engineering direction  
**Scope:** Yubie D2C commerce, launch operations, B2B lead generation, product-truth governance, and the platform capabilities required to operate safely in Indonesia  
**Last reviewed:** 2026-08-04

## 1. Mission

Build Yubie into Indonesia's most desirable modern local-superfood brand and a trustworthy food-commerce operation: premium enough to earn attention, clear enough to convert first-time visitors, operationally rigorous enough to sell physical food, and modular enough to scale without rewriting the company around the first vendor.

The product is not only a website. It is a coordinated system that connects:

- verified product identity and claims;
- customer discovery and education;
- pricing, inventory, checkout, payment, fulfilment, and support;
- batch/lot traceability and recall readiness;
- B2B sampling and relationship management;
- privacy, security, observability, and accountable operations.

## 2. North-star outcome

Yubie can accept and fulfil a real customer order with truthful product information, complete financial and inventory reconciliation, traceability to a sellable batch, and a support-visible audit trail—without a founder manually repairing normal transactions.

## 3. Business outcomes

1. Convert qualified traffic into product-detail engagement, cart additions, completed orders, newsletter opt-ins, and qualified B2B leads.
2. Launch Yubie Flour as the first sellable product while capturing demand for Shake and Ppang without presenting unapproved specifications as facts.
3. Maintain one canonical product, variant, price, inventory, lot, and claims model across web, API, customer support, fulfilment, and future sales channels.
4. Use licensed or otherwise authorized providers for regulated payment capabilities; Yubie remains the merchant and does not become an unlicensed payment processor.
5. Make every public nutrition, certification, ingredient, allergen, shelf-life, usage, and health-adjacent statement traceable to evidence, approval, effective dates, and an accountable owner.
6. Enable same-day investigation of payment, order, inventory, fulfilment, privacy, and product-safety incidents.

## 4. Customer promises

| Promise | Platform implication | Evidence of success |
|---|---|---|
| What customers see is truthful | Claims workflow, versioned product facts, review gate | No unapproved claim reaches production |
| Checkout is predictable | Idempotency, payment state machine, clear totals | No duplicate order/charge from retry |
| Availability is honest | Reservation and lot-aware inventory | Oversell rate is measured and near zero |
| Delivery status is explainable | Fulfilment events and support timeline | Support can answer without database access |
| Privacy choices are respected | Consent ledger, retention, data-subject workflow | Opt-out and deletion requests are auditable |
| Food issues can be contained | Lot traceability and recall runbook | Affected customers/orders can be identified quickly |

## 5. Product metrics

Metrics are segmented by channel, campaign, device, product, and new/returning customer. Targets are approved only after a trustworthy baseline exists.

### Acquisition and conversion

- qualified product-detail view rate;
- add-to-cart rate per available SKU;
- checkout-start and payment-success conversion;
- cart abandonment, classified by last successful step;
- newsletter consent conversion;
- B2B lead qualification and sample-to-opportunity conversion.

### Commerce and operations

- payment authorization/success rate by provider and method;
- duplicate-order and duplicate-payment prevention rate;
- inventory reservation failure and oversell rate;
- paid-to-packed and packed-to-delivered lead time;
- refund rate and reason distribution;
- reconciliation exceptions older than one business day;
- support contacts per 100 orders.

### Product-truth and food operations

- percentage of public facts linked to approved evidence;
- lots with complete supplier, production, expiry, and sellability records;
- time to identify every order affected by a lot;
- claim-review and product-release exceptions;
- expired or quarantined inventory prevented from sale.

## 6. Engineering outcomes

- npm-workspace/Turborepo monorepo with explicit app and package ownership.
- Server-first React experience and typed API boundaries using shared Zod contracts.
- Fetch-compatible API with a modular-monolith domain core and replaceable infrastructure adapters.
- PostgreSQL as the future transactional source of truth; queues/caches are derived delivery mechanisms, never the owner of orders or money.
- Idempotent commands, verified webhooks, immutable financial events, lot-aware inventory, and an auditable state history.
- Accessible, responsive, brand-faithful web experience using real Yubie assets and honest availability.
- Deterministic CI: locked install, lint, strict typecheck, tests, security audit, and verified production artifact.
- Observable production paths with SLOs, actionable alerts, runbooks, ownership, and restore drills.
- No secrets, production identifiers, card data, unsupported claims, or customer records in source control.

## 7. Delivery phases

### Phase 0 — Product truth and operating prerequisites

- Establish legal entity, seller identity, customer policies, product owner, food-safety owner, privacy owner, and incident commander rotation.
- Complete the product evidence pack for every sellable SKU: formula/version, ingredients, allergens, nutrition basis, net content, storage, shelf-life, label artwork, permits/registrations, halal status, supplier and production records.
- Define lot numbering, quarantine/release, FEFO allocation, complaint escalation, withdrawal, and recall procedures.

### Phase 1 — Venture-ready foundation (implemented)

- Brand and commerce website with product, editorial, recipe, B2B, FAQ, privacy, terms, cart, and checkout routes.
- Shared domain, validation, commerce, UI, and configuration packages.
- Standalone API boundaries for health, catalog, newsletter, B2B leads, and checkout.
- Provider-neutral commerce model, CI, production build verification, and initial product-claim suppression.

### Phase 2 — Transactional commerce

- Managed PostgreSQL, migrations, backups, point-in-time recovery, and restore testing.
- Durable customer/contact, catalog, price, order, payment, inventory, reservation, lot, fulfilment, consent, and audit records.
- Idempotent checkout and a hosted payment flow using an approved provider.
- Signed webhook inbox, transactional outbox, retries, dead-letter handling, reconciliation, refunds, and operator visibility.
- Transactional email and customer order timeline.

### Phase 3 — Operational launch

- Warehouse/fulfilment integration with lot capture, FEFO, packing, shipment, delivery, return, and exception flows.
- Customer-support console, complaint classification, refund approval, lot lookup, and incident escalation.
- Consent-aware product analytics and conversion dashboards.
- Load, security, accessibility, recovery, reconciliation, and food-recall exercises.
- Progressive release: internal → controlled customers → limited public → general availability.

### Phase 4 — Growth platform

- Customer accounts only when they reduce support or materially improve repeat purchase.
- Bundles/subscriptions after inventory and fulfilment reliability are proven.
- CMS-backed education and claim approval workflow.
- Referral and promotion controls with margin, fraud, and attribution guardrails.
- B2B sampling pipeline with CRM synchronization and measurable stage conversion.

## 8. Explicit non-goals before product-market evidence

- Microservices, Kubernetes, multi-region active-active, event sourcing for every entity, or custom payment processing.
- Loyalty points, marketplace sellers, complex subscriptions, or broad personalization before the core purchase/fulfilment loop is reliable.
- Public user-generated health claims or automated AI-generated product claims.
- Publishing nutritional, halal, BPOM, allergen, shelf-life, or health statements based on assumptions or packaging mockups.

## 9. Production definition of done

Production readiness requires all five gates, not only software CI:

1. **Product truth:** evidence and approvals match the exact sellable SKU and artwork.
2. **Food operations:** released lot exists, FEFO allocation works, and recall traceability is rehearsed.
3. **Transaction integrity:** order/payment/inventory states are idempotent and reconciled.
4. **Platform reliability:** security, privacy, observability, backup/restore, and incident controls are verified.
5. **Business operations:** fulfilment, customer support, refunds, finance, and accountable owners are ready.

The authoritative production plan and gate criteria live in [`production/`](./production/README.md).
