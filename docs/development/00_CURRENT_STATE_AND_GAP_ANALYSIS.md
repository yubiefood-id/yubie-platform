# 00 — Current State and Gap Analysis

## 1. Executive assessment

The repository is a credible full-stack foundation, not yet a transactional food-commerce system. It has a complete customer-facing route surface, shared TypeScript packages, validated prototype endpoints, persistent device-local cart and verified build pipeline. It does not yet persist customers/leads/orders, reserve lot-aware inventory, integrate payment or fulfilment providers, process durable events, reconcile money or expose operator recovery tools.

The key development risk is mistaking interface completeness for operational readiness. The next work must move vertically through domain, database, API, operator visibility and failure recovery rather than adding more visual pages.

## 2. Capability baseline

| Area | Current evidence | Status | Production gap |
|---|---|---|---|
| Monorepo | npm workspaces, Turborepo, `apps/*`, `packages/*` | implemented | Add dependency-boundary enforcement and affected CI. |
| Customer web | Home, shop, product detail, recipes, roots, impact, B2B, FAQ, cart, checkout shell, privacy and terms | implemented | Connect projections to canonical data and add production checkout/order status. |
| Catalog | Config/shared-domain catalog with Flour, Shake and Ppang | prototype | Versioned product specifications, variants, prices, sellability and claim projection. |
| Product truth | Visibility suppression for pending claims | prototype | Evidence records, approvals, expiry, artwork/specification scope and publish gate. |
| Cart | Device-local persistent cart | implemented | Server quote, signed anonymous session, stock/price revalidation and merge policy. |
| Checkout | Validated in-memory order creation; disabled payment UI | prototype | Durable order/reservation, idempotency, address, shipping quote and hosted payment. |
| Newsletter/waitlist | Validated form returning `202` | prototype | Consent ledger, deduplication, confirmation, preferences, suppression and delivery adapter. |
| B2B | Validated enquiry form returning `202` | prototype | Durable lead pipeline, assignment, SLA, CRM sync and lot-traceable samples. |
| API | Fetch-compatible health, products, newsletter, B2B and checkout routes | implemented prototype | Stable envelope, request IDs, OpenAPI, persistence, auth, rate limits and operator routes. |
| Database | Drizzle wiring/build migration support | foundation | Managed PostgreSQL schema, constraints, migrations, backup/PITR and restore evidence. |
| Payment | Provider-neutral commerce interface | foundation | Provider ADR, hosted session, signed webhook inbox, reconciliation and refunds. |
| Inventory/food ops | Domain requirement documented | planned | Lot ledger, release/quarantine, FEFO, reservation, movements, recall query. |
| Fulfilment | Production behavior documented | planned | Shipment/package model, adapter, tracking normalization and exception queue. |
| Operator tools | Roles and workflows documented | planned | Authenticated support, fulfilment, finance, food-safety and B2B surfaces. |
| Analytics | Event names and governance documented | planned | Consent-aware collection, schema tests and business-source reconciliation. |
| Observability | SLO/control model documented | planned | Runtime instrumentation, dashboards, alerts, synthetic checks and runbook links. |
| CI | Install, lint, typecheck, tests, build and audit | implemented | Migration/contract/security/accessibility/E2E gates and deploy evidence. |

## 3. Product truth baseline

- Yubie Flour is the only product represented as available in the current catalog, with proposed verified price entries of Rp15.000/250 g, Rp28.000/500 g and Rp52.000/1 kg. Sellability still depends on the production release gate.
- Yubie Shake remains coming soon. Packaging reference: 10 × 30 g sachets, total 300 g; public claims and sale require exact evidence and approval.
- Yubie Ppang remains coming soon. Packaging reference: 5 × 60 g, total 300 g; fresh/chilled and frozen forms are separate SKUs and operational promises.
- No nutrition, allergen, certification, shelf-life or health-adjacent value may be derived from mockups or marketing intent.

## 4. Highest-risk gaps

1. **False-positive purchase:** an in-memory `pending-payment` order looks successful but disappears after restart.
2. **Price authority:** browser cart values are convenient display state, not trustworthy checkout totals.
3. **Inventory authority:** no released-lot availability or concurrent reservation control exists.
4. **Lead loss:** newsletter and B2B success screens currently acknowledge validation without durable storage/delivery.
5. **Duplicate boundaries:** web route handlers and standalone API expose similar behavior without one application service.
6. **Recovery blindness:** normal failures require code/database access because operator tools do not yet exist.
7. **Evidence drift:** product facts are config-driven but not scoped to immutable product specification and approval versions.

## 5. Immediate architectural corrections

- Route all web and standalone API mutations through the same application use cases; route handlers are adapters, not business logic.
- Replace `InMemoryCommerceAdapter` only after repository interfaces and transactional tests exist; preserve it for deterministic unit/demo tests.
- Introduce PostgreSQL through vertical slices, beginning with consent/waitlist and B2B leads, then catalog truth, then checkout/order/inventory.
- Establish request IDs, stable error envelopes and idempotency before payment integration.
- Build the smallest operator read model with each critical write path; no invisible production workflow.
- Keep external providers behind ports and persist delivery attempts/outcomes locally.

## 6. Exit condition for the development program

The platform exits development-only status when one controlled real order can be discovered, quoted, paid, allocated to a released lot, packed, shipped, reconciled, supported and traced without manual database mutation, and when one complaint/recall exercise identifies all affected inventory and recipients.
