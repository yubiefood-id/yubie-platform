# 34 — Observability, SLOs, Backup and Disaster Recovery

## 1. Current critical journeys

The current architecture does not optimize around first-party checkout. Measure what Yubie actually owns.

| Journey | Initial SLI |
|---|---|
| Public product/API | successful non-5xx responses |
| Marketplace redirect | valid listing requests receiving correct redirect |
| WhatsApp redirect | valid intent requests reaching configured chat destination |
| Chatwoot webhook capture | verified events durably accepted |
| B2B lead durability | accepted qualification state persists |
| CRM sync | qualified leads eventually projected |
| Marketplace import | expected source window processed without silent row loss |

Targets are established after baseline, but safety/integrity errors have stricter treatment than latency.

## 2. Suggested initial objectives

Planning targets, revalidated after load tests:

~~~text
public API availability              99.9%
redirect path availability           99.95%
verified webhook durable capture     99.95%
oldest critical outbox job           < 5 min under healthy providers
listing registry freshness           explicit per listing
daily report import freshness        < 24h when report process is enabled
~~~

Assistant safety is not expressed only as uptime; it has evaluation failure gates.

## 3. Logs

Structured fields:

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

Never log auth headers, access tokens, full phone/email, message body, B2B free text or imported customer data by default.

## 4. Metrics

System:

- request rate/error/latency;
- CPU/RAM/disk;
- DB pool/query latency;
- queue depth/oldest age;
- provider timeout/rate-limit;
- backup age/failure.

Business:

- marketplace clicks;
- WhatsApp starts;
- assistant handoffs;
- B2B qualification;
- CRM sync;
- listing health;
- import row/exception/freshness.

## 5. Tracing

Use OpenTelemetry-compatible tracing where useful:

~~~text
redirect/API -> DB
Chatwoot webhook -> inbox -> worker -> assistant -> Chatwoot
B2B qualification -> outbox -> CRM
import -> staging -> projection
~~~

Sample successful traffic; retain errors longer within privacy policy.

## 6. Alert philosophy

Page only for actionable customer/data/safety impact:

- public API/redirect burn;
- webhook capture failure;
- queue oldest age beyond SLA;
- database unavailable/disk nearly full;
- backup/PITR failure;
- broken listing spike;
- food-safety escalation delivery failure;
- security/secret event.

Create tickets, not pages, for slow trends.

## 7. Backup layers

For self-hosted PostgreSQL:

1. continuous/regular physical backup + WAL/PITR capability;
2. periodic logical export for portability;
3. encrypted off-host object storage;
4. provider/VPS snapshot as an additional layer, not the only backup.

PostgreSQL PITR requires a base backup plus a continuous WAL archive; `pg_dump` alone is not PITR.

## 8. Backup policy

Define and monitor:

~~~text
RPO
RTO
backup interval
retention
off-host location
encryption
restore owner
last successful restore test
~~~

Planning objective for Yubie Core:

~~~text
RPO <= 15 minutes for operational DB once live automation matters
RTO <= 4 hours at early stage
~~~

These are engineering targets requiring business approval.

## 9. Restore drill

Quarterly minimum after production launch:

1. choose recovery point;
2. restore into isolated environment;
3. run migrations if required by procedure;
4. verify row counts and invariants;
5. replay/reconcile inbox/outbox after recovery point;
6. verify listing/B2B/product truth;
7. document elapsed time and gaps.

A backup that has not been restored is unproven.

## 10. Disaster scenarios

- VPS loss;
- PostgreSQL corruption;
- accidental destructive migration;
- expired/full disk;
- Chatwoot outage;
- CRM outage;
- compromised provider token;
- bad assistant release;
- marketplace import corruption.

Each scenario maps to a runbook and named owner.
