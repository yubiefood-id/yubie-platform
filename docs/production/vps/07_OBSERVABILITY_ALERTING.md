# 07 — Observability and Alerting

## 1. Questions telemetry must answer

- customer path working?
- durable state safe?
- provider integrations behind?
- bad release responsible?
- host/database near capacity?

## 2. Metrics

~~~text
HTTP rate/error/latency
redirect outcomes
DB pool/query
queue depth/age
webhook accept/process
CRM sync
listing health
marketplace import
assistant outcome/latency
host CPU/RAM/disk
backup age
~~~

## 3. Logs

Structured JSON with service/environment/release/request/correlation/event/outcome/duration.

No raw chat/secret/PII payload by default.

## 4. Host alerts

Warn/critical for disk, sustained memory/swap pressure, container restart loop, Docker down, certificate/backup failure.

## 5. Application alerts

Page for API/redirect error-budget burn, webhook capture failure, DB outage, critical queue lag, backup failure, safety escalation failure or security incident.

Ticket for non-critical provider retries/listing/import freshness trends.

## 6. Synthetic checks

External checks for health/public product/test-safe redirect.

Do not create messages/orders through synthetic monitors.

## 7. Dashboards

~~~text
Platform
Channel/Marketplace
Conversation/Assistant
B2B/CRM
Database/Backup
Host/Container
~~~

## 8. Release markers

Emit release SHA, deploy time, migration and flag changes for correlation.
