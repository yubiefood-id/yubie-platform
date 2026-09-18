# 07 — Reliability, Observability and SLOs

## 1. Critical journeys

The current architecture optimizes the journeys Yubie actually owns.

| Journey | SLI | Initial planning objective |
|---|---|---|
| Public product/API | successful valid non-5xx requests | 99.9% monthly |
| Marketplace redirect | valid listing request receives correct destination | 99.95% monthly |
| WhatsApp redirect | valid intent receives configured destination | 99.95% monthly |
| Chatwoot event capture | valid authenticated event durably accepted | 99.95% monthly |
| Critical async delivery | oldest critical job under healthy dependency | < 5 minutes |
| Marketplace report/import | expected source window published | explicit freshness policy |

These are planning objectives. Rebaseline after production/load evidence.

Assistant safety is governed by evaluation and human-handoff gates, not uptime alone.

## 2. Telemetry

### Structured logs

Include:

~~~text
timestamp
level
service
environment
release_sha
request_id
correlation_id
event_code
safe_entity_ref
provider
outcome
duration_ms
~~~

Redact tokens, cookies, phone/email, message bodies, CRM notes, addresses and marketplace customer data.

### Metrics

Monitor:

- request/error/latency;
- redirect outcome;
- DB pool/query/locks;
- queue depth/oldest age;
- webhook accept/process;
- provider 429/timeouts;
- CRM sync;
- listing health;
- marketplace import freshness/exceptions;
- assistant handoff/error/cost;
- host CPU/RAM/disk;
- backup age/failure.

### Traces

Use OpenTelemetry-compatible traces when they improve diagnosis across API -> DB, webhook -> worker -> provider and import pipelines.

## 3. Degraded modes

- edge/public web may remain available if Core VPS fails;
- marketplace routing may fall back only to a last-known verified mapping if that fallback is explicitly implemented/tested;
- assistant outage falls back to human Chatwoot;
- CRM outage never discards durable B2B qualification;
- marketplace API outage falls back to verified links/report workflows;
- analytics outage never blocks customer communication;
- DB unavailability fails durable writes closed rather than pretending success.

## 4. Alert policy

Page for:

- sustained public API/redirect error-budget burn;
- webhook durable-capture failure;
- database unavailable;
- critical queue lag;
- backup/PITR failure;
- disk exhaustion;
- food-safety escalation delivery failure;
- suspected security compromise.

Create tickets for non-urgent trends such as intermittent CRM retry, listing health degradation or import staleness.

## 5. Recovery evidence

Quarterly after launch, rotate exercises:

- database restore;
- provider outage;
- bad assistant release;
- Chatwoot outage;
- CRM outage;
- marketplace import replay/corruption;
- credential revocation.

Record actual RPO/RTO and corrective actions.
