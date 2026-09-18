# 15 — Capacity, Cost and Vendor Governance

## 1. Capacity dimensions

Current architecture capacity is measured by:

~~~text
public API/redirect requests
Chatwoot webhook volume
assistant turns
B2B qualification/sync
marketplace import rows/files
PostgreSQL data and WAL growth
queue backlog
logs/traces
object storage
~~~

Do not size around first-party checkout traffic while checkout remains marketplace-owned.

## 2. Cost model

Track separately:

- Core VPS / PostgreSQL;
- Chatwoot hosting;
- CRM hosting;
- backup/object storage;
- observability/logging;
- AI inference;
- transactional messaging/email;
- DNS/CDN/domain;
- marketplace/provider fees as business channel cost.

## 3. OSS is not zero-cost operations

Self-hosting Chatwoot/CRM can reduce SaaS subscription cost while adding:

- patching;
- backup/restore;
- upgrades;
- monitoring;
- security;
- on-call;
- capacity planning.

Choose self-hosting only when that tradeoff is justified.

## 4. Vendor/OSS evaluation

Evaluate:

- capability fit;
- license;
- security;
- upstream/release health;
- Indonesian marketplace/provider coverage;
- authentication/webhook/reconciliation quality;
- export/exit;
- privacy/data location;
- support/escalation;
- operating cost;
- migration cost.

## 5. Scaling rule

Every scale-up or new service records:

~~~text
measured bottleneck/problem
baseline metric
expected improvement
cost delta
rollback
post-change metric
~~~

Do not add Kubernetes, Redis, Kafka, replicas or an ERP solely because they are common architecture components.

## 6. Provider exit

Critical integrations stay behind provider ports and stable Yubie IDs.

A CRM/marketplace/assistant provider replacement should be an adapter/projection migration rather than a rewrite of B2B intake or product truth.

## 7. Budget guardrails

- budget alerts by environment/provider;
- bounded log retention;
- AI per-conversation budgets;
- object/import lifecycle;
- preview cleanup;
- bounded retries;
- no unbounded raw conversation data lake.
