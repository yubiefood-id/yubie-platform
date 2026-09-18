# 25 — Engineering Execution Model

## 1. Purpose

This document turns the architecture into an implementation operating system. The goal is not maximum software surface; it is the smallest reliable system that solves the highest-value Yubie business problems.

## 2. Decision hierarchy

Every engineering proposal answers, in order:

1. **What measured business/operational problem exists?**
2. **Who owns the canonical truth?**
3. **Can an existing marketplace/Chatwoot/CRM capability solve it?**
4. **What minimum Yubie-owned state is required?**
5. **What happens when the provider is unavailable or ambiguous?**
6. **How is success measured?**
7. **How is the change disabled or rolled back?**

A feature with no answer to (1) or (6) does not enter implementation merely because it is technically attractive.

## 3. Current priorities

~~~text
P0  truthful public product/channel experience
P0  reliable marketplace purchase routing
P0  WhatsApp team operations
P0  safe assistant + human handoff

P1  durable B2B qualification
P1  CRM synchronization
P1  listing/source/campaign analytics
P1  marketplace outcome imports

P2  approved marketplace APIs
P2  ERP/back-office automation

DEFERRED
    direct Yubie checkout/payment/order reservation
~~~

## 4. Current vs target repository

Current:

~~~text
apps/web
apps/api
packages/domain
packages/validation
packages/commerce
packages/ui
packages/config
~~~

Target additions introduced only by phases that need them:

~~~text
apps/worker
apps/ops                    optional thin exception UI

packages/application
packages/persistence
packages/integrations
packages/assistant

infrastructure/local
infrastructure/production
~~~

Do not scaffold all target packages in one architecture-only PR. M1/M2 introduce the first persistence/worker needs.

## 5. Vertical-slice policy

Example: marketplace redirect.

A complete slice contains:

- `MarketplaceListing` domain definition;
- PostgreSQL repository or controlled configuration source;
- `ResolvePurchaseDestination` application use case;
- `GET /go/:channel/:listingKey`;
- non-PII outbound intent event;
- redirect allowlist;
- link-health operator view/report;
- tests for disabled/unknown/malformed destination;
- metrics and rollback.

A UI button without the above is not a production marketplace integration.

## 6. Integration maturity

Use the least complex level that solves the problem.

~~~text
0 manual/operator
1 deterministic import/export
2 read API/webhook
3 controlled provider write
4 bi-directional automation
~~~

Promotion between levels requires evidence that the previous level creates meaningful cost, latency or risk.

## 7. Product program alignment

Yubie software must support three product roles:

- **Yubie Flour** — ingredient platform for consumer and business use;
- **Yubie Shake / puree-instant program** — convenience format;
- **Yubie Ppang / goguma-ppang program** — frozen/one-bite bakery direction.

The research program includes formulation, lab/sensory testing, market testing, packaging, licensing/commercialization and certification preparation. Software therefore needs evidence-aware product truth and lifecycle states, but must not expose research hypotheses as approved consumer claims.

## 8. Definition of a release increment

Each increment has:

~~~text
Problem statement
Owner
Scope / non-goals
Data owner
Threat/failure analysis
Schema/API change
UX/operator path
Tests
Observability
Migration/rollback
Launch metric
Evidence links
~~~

## 9. Branch/PR discipline

- one bounded change per PR;
- migrations and application compatibility reviewed together;
- no "mega PR" installing CRM + Chatwoot + marketplace API + database;
- provider integrations land behind fakes/flags before real credentials;
- destructive schema change uses expand/contract;
- docs/ADR updated in the same PR when ownership or state machines change.

## 10. Environment promotion

~~~text
local fake
 -> CI real Postgres
 -> staging real integration sandbox/test tenant
 -> production shadow/read-only
 -> limited write
 -> full approved rollout
~~~

Never first-test a provider write in production.

## 11. Agentic development rules

Coding agents may:

- inspect code/docs;
- implement bounded phase tasks;
- run tests;
- generate migrations;
- update non-secret configuration/templates.

Agents may not autonomously:

- publish health/regulatory claims;
- rotate production credentials without an approved procedure;
- enable high-risk chatbot intents;
- enable marketplace write APIs;
- change production data directly;
- merge a failed acceptance gate.

## 12. Phase completion

A phase is complete only when its acceptance report demonstrates:

- functional behavior;
- failure behavior;
- security/privacy controls;
- operator ownership;
- rollback;
- monitoring;
- documentation;
- all required tests green.

"Code merged" is not phase completion.
