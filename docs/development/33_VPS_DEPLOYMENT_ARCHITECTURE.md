# 33 — VPS Deployment Architecture

## 1. Objective

Provide a production-capable VPS design that is economical for an early-stage startup but has explicit blast-radius, backup, security and scaling boundaries.

The public web can continue on its current Cloudflare/Vinext-compatible hosting. The VPS hosts stateful/backend workloads.

## 2. Recommended topology

~~~mermaid
flowchart TB
  Internet --> CDN["Cloudflare DNS/WAF/CDN"]
  CDN --> WEB["Yubie Web / edge"]
  CDN --> CADDY["Core VPS: Caddy"]
  CADDY --> API["Yubie API"]
  CADDY --> OPS["optional Ops UI"]
  API --> PG[("Yubie PostgreSQL")]
  WORKER["Yubie Worker"] --> PG
  WORKER --> EXT["Chatwoot / CRM / Marketplace APIs"]

  WA["WhatsApp Cloud API"] --> CHAT["Chatwoot"]
  CHAT --> CADDY
~~~

## 3. Do not put everything on one tiny VPS

Self-hosted Chatwoot is materially heavier than the Yubie API/worker. Its official production guidance recommends multiple CPU cores, at least 8 GB RAM and PostgreSQL/Redis.

Therefore:

### Cost-conscious safe start

~~~text
Web: edge/Cloudflare
Core VPS: Yubie API + worker + Yubie PostgreSQL
Chatwoot: managed cloud OR dedicated VPS
CRM: managed/separate deployment
~~~

### Self-hosted OSS stack

~~~text
VPS-A Core
  Caddy
  Yubie API
  worker
  Yubie Postgres

VPS-B Conversation
  Chatwoot web/worker
  Chatwoot Postgres
  Redis
  object storage adapter

VPS-C CRM optional
  Comp CRM app/API/agent
  CRM Postgres
~~~

Do not share application databases.

## 4. Core VPS starting class

Before load testing, a practical initial target is:

~~~text
4 vCPU
8 GB RAM
80-160 GB NVMe
Ubuntu 24.04 LTS
~~~

This is a planning baseline, not an SLO guarantee. Increase based on measured DB memory, queue and traffic.

If Yubie Postgres moves to managed DB, the core VPS can be smaller.

## 5. Process packaging

Production application services are containers built from immutable commit-SHA images.

Recommended core Compose services:

~~~text
caddy
api
worker
postgres
backup-agent
otel-collector?   optional
~~~

Only Caddy publishes public ports.

PostgreSQL, API and worker networks are private; do not publish database port to the internet.

## 6. DNS

Suggested:

~~~text
www.yubie.id         -> edge web
api.yubie.id         -> Core VPS via Cloudflare
ops.yubie.id         -> restricted Core VPS
support.yubie.id     -> Chatwoot host
crm.yubie.id         -> restricted CRM host
~~~

Admin services should be protected by identity-aware proxy/VPN or IP policy in addition to application auth.

## 7. Reverse proxy

Caddy is recommended for the initial VPS because TLS provisioning/renewal and reverse proxy configuration are simple.

Public backend containers bind only to internal Docker networks. Caddy routes by host/path and sets reasonable body/time limits per endpoint.

## 8. Docker firewall caveat

Docker-published ports can bypass assumptions made by UFW rules. Therefore:

- publish only 80/443 from the reverse proxy;
- do not publish PostgreSQL/Redis/API internal ports externally;
- verify `ss -lntup`, Docker NAT rules and an external port scan after every infra change.

## 9. Storage

Separate:

~~~text
database volume
caddy certificate volume
application temp
backup cache
Chatwoot uploads/object storage
~~~

Do not use the VPS local disk as the only copy of production evidence/backups.

## 10. Failure domains

Core VPS down:

- web discovery can remain available at edge;
- marketplace links can optionally have an edge/static fallback only if safe;
- tracked attribution/backend and B2B automation degrade.

Chatwoot VPS down:

- WhatsApp conversation operations are affected;
- Yubie core remains available;
- reconciliation runs after recovery.

CRM down:

- conversation and durable Yubie lead remain;
- CRM sync retries.

## 11. Scaling path

~~~text
single Core VPS
 -> managed/dedicated Postgres
 -> API replicas
 -> worker replicas
 -> dedicated observability
~~~

Do not jump to Kubernetes before Compose/single-host limits are measured.
