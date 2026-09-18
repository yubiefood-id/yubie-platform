# 36 — Capacity, Cost and Scaling Plan

## 1. Principle

Scale only after identifying the constrained resource. CPU, RAM, DB connections, storage, queue throughput and provider rate limits fail differently.

## 2. Capacity dimensions

Track:

~~~text
web/API requests
redirects per minute
Chatwoot webhook events
assistant turns
B2B signals
CRM sync operations
marketplace import rows/files
PostgreSQL data/WAL growth
log/trace volume
object storage
~~~

## 3. Load profiles

Test at least:

- normal daily traffic;
- campaign spike;
- WhatsApp burst;
- large marketplace report import;
- provider 429/slow response;
- worker backlog recovery.

Do not benchmark only HTTP reads.

## 4. Core VPS scaling

Typical progression:

### Stage A

~~~text
1 core VPS
API + worker + Postgres
~~~

### Stage B

Move Postgres to managed/dedicated database when DB memory/I/O or recovery requirements dominate.

### Stage C

Run multiple stateless API replicas behind Caddy/load balancer; worker uses queue leasing.

### Stage D

Split worker/import/assistant resource pools when long jobs affect critical webhook latency.

Kubernetes is not a default stage.

## 5. Chatwoot

If self-hosted, size Chatwoot independently. Do not starve Yubie Postgres/worker to fit Chatwoot on the same host.

Chatwoot upgrades and database/Redis backup have independent runbooks.

## 6. AI cost

Measure:

~~~text
assistant turns/day
model tokens/turn
tool calls
handoff rate
cost per safely automated resolved conversation
~~~

Cheapest model is not automatically cheapest workflow if it creates more handoffs/errors.

Use deterministic routing/tools before model calls where possible.

## 7. Marketplace integration cost

Before L2/L3 APIs, quantify current manual cost:

~~~text
operator minutes/day
listing changes/week
report processing time
stock drift incidents
order/return reconciliation effort
~~~

Only automate when expected reduction exceeds build/maintenance risk.

## 8. Cost budget categories

- core VPS/DB;
- Chatwoot hosting;
- CRM hosting;
- object storage/backups;
- monitoring/logs;
- transactional messaging;
- AI inference;
- domain/DNS/CDN;
- marketplace/provider fees outside infrastructure.

## 9. Cost guardrails

- environment budgets;
- log retention caps;
- model per-conversation budgets;
- import storage lifecycle;
- preview environment cleanup;
- no unbounded retry loops;
- no full raw conversation export to analytics/data lake.

## 10. Scaling trigger documentation

Every scale-up records:

~~~text
measured bottleneck
before metrics
expected improvement
cost delta
rollback
after metrics
~~~

This prevents infrastructure growth by intuition alone.
