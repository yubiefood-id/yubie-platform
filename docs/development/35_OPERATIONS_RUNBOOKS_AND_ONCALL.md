# 35 — Operations, Runbooks and On-call

## 1. Operating principle

A startup does not need a large SRE organization, but every production failure still needs an owner and a repeatable response.

## 2. Daily checks

Automated where possible:

- core health/readiness;
- disk/database volume;
- backup age;
- queue oldest age;
- Chatwoot webhook failure;
- CRM sync failure;
- marketplace listing health;
- marketplace import freshness;
- certificate expiry status;
- security update availability.

Humans review exceptions, not dashboards all day.

## 3. Weekly

- unresolved operator tasks;
- CRM sync backlog;
- listing BROKEN/PAUSED;
- assistant handoff/failure samples;
- top unknown intents;
- storage growth;
- dependency/security alerts;
- backup report.

## 4. Monthly

- access review;
- secret inventory/expiry;
- restore test or rotating recovery exercise;
- provider SLA/API changes;
- cost per environment;
- capacity trend;
- assistant evaluation rerun;
- product-truth/certification expiry report.

## 5. Incident roles

Small-team version:

~~~text
Incident Commander
Technical Lead
Business/Ops Lead
Communications/Scribe
Food Safety/Privacy owner when applicable
~~~

One person can cover multiple roles, but every role is explicit.

## 6. Runbook: broken marketplace destination

1. verify whether destination is genuinely unavailable;
2. mark listing BROKEN/PAUSED;
3. remove/disable CTA;
4. present other verified marketplace or WhatsApp path;
5. correct listing;
6. reverify;
7. measure affected clicks.

Never redirect users to an unverified substitute listing.

## 7. Runbook: WhatsApp/Chatwoot outage

1. determine Meta vs Chatwoot vs VPS cause;
2. pause Yubie auto-reply integration if ambiguous;
3. preserve webhook/inbox evidence;
4. expose alternative contact channel if approved;
5. restore Chatwoot;
6. reconcile missed conversations/events through provider API where supported;
7. review messages requiring human follow-up.

## 8. Runbook: assistant unsafe response

1. disable auto-reply kill switch;
2. preserve action/policy/tool/version metadata;
3. identify affected conversations without broad data export;
4. human review/correct customer communication;
5. create regression fixture;
6. fix policy/knowledge/tool/model;
7. rerun full evaluation;
8. controlled re-enable.

## 9. Runbook: CRM unavailable

- keep qualifying in Chatwoot/Yubie;
- outbox retries with bounded backoff;
- do not create manual duplicate deals until reconciliation check;
- if outage exceeds SLA, provide operator queue/export;
- after recovery, sync and deduplicate by stable Yubie lead ID.

## 10. Runbook: bad marketplace import

- do not overwrite source file;
- quarantine import batch;
- roll back/publish previous projection;
- inspect mapping/schema change;
- fix parser/mapping;
- replay same checksum safely;
- compare row counts and aggregates.

## 11. Runbook: disk pressure

At thresholds:

~~~text
70% investigate trend
80% create urgent ops task
90% page/on-call; stop non-essential growth jobs
95% protect DB, logs and backups from uncontrolled exhaustion
~~~

Never delete canonical DB files/logs blindly. Clean reconstructible Docker/build/cache/log artifacts according to retention first.

## 12. Runbook: food-safety conversation

- human handoff immediately;
- collect product/order/reference details without diagnosing;
- identify SKU/batch where available;
- notify responsible product/food-safety owner;
- quarantine/stop-sale decisions happen through approved operational process;
- preserve timeline and communications;
- do not let assistant close the incident.

## 13. Release on-call

Every high-risk release has:

- deploy owner;
- rollback owner;
- observation window;
- dashboard links;
- abort thresholds;
- communication route.

Do not deploy a high-risk provider/bot migration immediately before an unstaffed period.
