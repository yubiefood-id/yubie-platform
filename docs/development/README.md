# Yubie Development Engineering Handbook

**Status:** implementation contract

**Audience:** product, engineering, design, data, operations, food-safety, regulatory, finance and support owners

**Last reviewed:** 2026-08-04

This directory translates Yubie's production requirements into buildable software slices. The production handbook defines the controls required to operate safely; this handbook defines the systems, interfaces, data, ownership, sequencing and engineering evidence needed to implement those controls.

## Reading order

1. [`../DEVELOPMENT_GOALS.md`](../DEVELOPMENT_GOALS.md) — business and engineering outcomes.
2. [`00_CURRENT_STATE_AND_GAP_ANALYSIS.md`](./00_CURRENT_STATE_AND_GAP_ANALYSIS.md) — what exists and what remains simulated.
3. [`01_FEATURE_SYSTEM_CATALOG.md`](./01_FEATURE_SYSTEM_CATALOG.md) — full capability inventory and release classification.
4. C4 views: system context, containers and the two major component views.
5. The domain-specific document for the development slice.
6. [`17_DELIVERY_PLAN_EPICS_AND_DEPENDENCIES.md`](./17_DELIVERY_PLAN_EPICS_AND_DEPENDENCIES.md) and [`18_DEFINITION_OF_DONE_AND_PR_TEMPLATE.md`](./18_DEFINITION_OF_DONE_AND_PR_TEMPLATE.md).

## Document map

| Document | Engineering question answered |
|---|---|
| [`00_CURRENT_STATE_AND_GAP_ANALYSIS.md`](./00_CURRENT_STATE_AND_GAP_ANALYSIS.md) | What is real today, what is prototype-only and what blocks launch? |
| [`01_FEATURE_SYSTEM_CATALOG.md`](./01_FEATURE_SYSTEM_CATALOG.md) | Which customer, operator and platform capabilities must exist? |
| [`02_C4_SYSTEM_CONTEXT.md`](./02_C4_SYSTEM_CONTEXT.md) | Who uses Yubie and which external systems surround it? |
| [`03_C4_CONTAINER_VIEW.md`](./03_C4_CONTAINER_VIEW.md) | Which deployable applications and data stores comprise the platform? |
| [`04_C4_COMPONENT_WEB.md`](./04_C4_COMPONENT_WEB.md) | How is the customer-facing web container decomposed? |
| [`05_C4_COMPONENT_PLATFORM.md`](./05_C4_COMPONENT_PLATFORM.md) | How are API, domain modules and asynchronous work decomposed? |
| [`06_TECH_STACK_AND_REPOSITORY.md`](./06_TECH_STACK_AND_REPOSITORY.md) | Which technologies, ownership boundaries and dependency rules apply? |
| [`07_DOMAIN_MODEL_AND_STATE_MACHINES.md`](./07_DOMAIN_MODEL_AND_STATE_MACHINES.md) | What are the aggregates, invariants and valid state transitions? |
| [`08_DATA_ARCHITECTURE_AND_MIGRATIONS.md`](./08_DATA_ARCHITECTURE_AND_MIGRATIONS.md) | How is transactional, analytical and sensitive data stored and changed? |
| [`09_API_DESIGN_AND_ENDPOINT_CATALOG.md`](./09_API_DESIGN_AND_ENDPOINT_CATALOG.md) | What are the HTTP, idempotency, error and webhook contracts? |
| [`10_WEB_APP_DESIGN_SYSTEM_CONTENT_SEO.md`](./10_WEB_APP_DESIGN_SYSTEM_CONTENT_SEO.md) | How are routes, UI, accessibility, content and discoverability built? |
| [`11_WAITLIST_NEWSLETTER_B2B_CRM.md`](./11_WAITLIST_NEWSLETTER_B2B_CRM.md) | How are demand capture, consent, lead routing and samples implemented? |
| [`12_COMMERCE_CHECKOUT_PAYMENT.md`](./12_COMMERCE_CHECKOUT_PAYMENT.md) | How do cart, quotes, checkout, payment, refunds and reconciliation work? |
| [`13_INVENTORY_LOT_FULFILMENT.md`](./13_INVENTORY_LOT_FULFILMENT.md) | How do sellability, reservations, FEFO, shipping and recall traceability work? |
| [`14_SECURITY_PRIVACY_IDENTITY.md`](./14_SECURITY_PRIVACY_IDENTITY.md) | How are identities, permissions, personal data and threats controlled? |
| [`15_ANALYTICS_OBSERVABILITY_FEATURE_FLAGS.md`](./15_ANALYTICS_OBSERVABILITY_FEATURE_FLAGS.md) | How are behavior, business truth, runtime health and rollouts measured? |
| [`16_TESTING_CI_CD_AND_DEV_EXPERIENCE.md`](./16_TESTING_CI_CD_AND_DEV_EXPERIENCE.md) | How does a change move safely from laptop to production? |
| [`17_DELIVERY_PLAN_EPICS_AND_DEPENDENCIES.md`](./17_DELIVERY_PLAN_EPICS_AND_DEPENDENCIES.md) | In what order should the platform be built? |
| [`18_DEFINITION_OF_DONE_AND_PR_TEMPLATE.md`](./18_DEFINITION_OF_DONE_AND_PR_TEMPLATE.md) | What evidence is required before a development slice is complete? |
| [`CURRENT_STATE_REVISION_REPORT.md`](./CURRENT_STATE_REVISION_REPORT.md) | What changed in the root → format → application → recipe product-discovery revision? |

## C4 modeling policy

The diagrams use the [C4 model](https://c4model.com/): system context for people and external systems, container view for deployable applications/data stores, and component views for cohesive modules within a container. Level-4 code diagrams are generated on demand because permanent class/module diagrams become stale quickly.

## Status vocabulary

| Status | Meaning |
|---|---|
| `implemented` | Present in code and covered by at least one automated check. |
| `partial` | Some user-visible behavior exists, but one or more required states/contracts are absent. |
| `foundation` | A seam or tool exists, but no production business outcome depends on it yet. |
| `prototype` | Demonstrates interaction but is not durable, integrated or production-authorized. |
| `planned` | Accepted target with a documented dependency and acceptance criteria. |
| `verification required` | Product, regulatory, provider or business truth must be supplied by an accountable owner. |
| `deferred` | Explicitly outside the current production path. |

## Development-to-production traceability

| Development contract | Primary production control |
|---|---|
| C4, stack and component boundaries | [`02_TARGET_SYSTEM_ARCHITECTURE.md`](../production/02_TARGET_SYSTEM_ARCHITECTURE.md) |
| Domain and data model | [`03_DATA_MODEL_AND_PERSISTENCE.md`](../production/03_DATA_MODEL_AND_PERSISTENCE.md) |
| API, idempotency and integrations | [`04_API_AND_INTEGRATION_CONTRACTS.md`](../production/04_API_AND_INTEGRATION_CONTRACTS.md) |
| Checkout, payment, inventory and fulfilment | [`05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md`](../production/05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md) |
| Identity, privacy and security | [`06_SECURITY_PRIVACY_AND_ACCESS.md`](../production/06_SECURITY_PRIVACY_AND_ACCESS.md) |
| Observability and SLO instrumentation | [`07_RELIABILITY_OBSERVABILITY_AND_SLOS.md`](../production/07_RELIABILITY_OBSERVABILITY_AND_SLOS.md) |
| CI/CD and developer release flow | [`08_CI_CD_AND_RELEASE_ENGINEERING.md`](../production/08_CI_CD_AND_RELEASE_ENGINEERING.md) |
| Test portfolio | [`09_TESTING_AND_QUALITY_STRATEGY.md`](../production/09_TESTING_AND_QUALITY_STRATEGY.md) |
| Analytics and feature rollout | [`10_ANALYTICS_EXPERIMENTATION_AND_GROWTH.md`](../production/10_ANALYTICS_EXPERIMENTATION_AND_GROWTH.md) |
| Waitlist, B2B and operator surfaces | [`11_B2B_CRM_AND_OPERATOR_OPERATIONS.md`](../production/11_B2B_CRM_AND_OPERATOR_OPERATIONS.md) |
| Development phases | [`13_PRODUCTION_DELIVERY_ROADMAP.md`](../production/13_PRODUCTION_DELIVERY_ROADMAP.md) |
| Definition of done | [`14_GO_LIVE_CHECKLIST.md`](../production/14_GO_LIVE_CHECKLIST.md) |

## Source-of-truth rule

When documents conflict, use: approved product/regulatory evidence → `DEVELOPMENT_GOALS.md` → production handbook → this development handbook → implementation code. Code that conflicts with an approved invariant is a defect, not a new source of truth.
