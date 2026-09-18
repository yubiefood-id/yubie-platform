# Yubie Production VPS Handbook

This handbook defines the production-grade VPS baseline for Yubie's **marketplace-first + WhatsApp-first** platform.

It intentionally favors Docker Compose and explicit operational discipline before Kubernetes or a distributed platform.

## Recommended topology

~~~text
Edge / CDN
  Cloudflare + Yubie Web

Core VPS
  Caddy
  Yubie API
  Yubie Worker
  Yubie PostgreSQL
  backup agent
  lightweight telemetry

Conversation
  Chatwoot Cloud
  OR dedicated Chatwoot VPS

CRM
  separate Comp CRM deployment or hosted runtime
~~~

Do not colocate every sidecar on one under-sized server.

## Read in order

1. [01 Host Baseline](./01_HOST_BASELINE.md)
2. [02 Network, DNS and TLS](./02_NETWORK_DNS_TLS.md)
3. [03 Containers and Service Layout](./03_CONTAINER_SERVICE_LAYOUT.md)
4. [04 PostgreSQL, Backup and PITR](./04_POSTGRES_BACKUP_PITR.md)
5. [05 Secrets, Identity and Access](./05_SECRETS_IDENTITY_ACCESS.md)
6. [06 CI/CD and Deployment](./06_CICD_DEPLOYMENT.md)
7. [07 Observability and Alerting](./07_OBSERVABILITY_ALERTING.md)
8. [08 Chatwoot Production](./08_CHATWOOT_PRODUCTION.md)
9. [09 CRM Production](./09_CRM_PRODUCTION.md)
10. [10 Security Hardening](./10_SECURITY_HARDENING.md)
11. [11 Disaster Recovery and Runbooks](./11_DISASTER_RECOVERY_RUNBOOKS.md)
12. [12 Go-Live](./12_GO_LIVE.md)

## Non-negotiables

- Ubuntu LTS;
- SSH key authentication;
- no public Postgres/Redis;
- only reverse proxy publishes application traffic;
- immutable release images;
- off-host backup;
- tested restore;
- named operator accounts;
- separate production/staging credentials;
- no production secrets in Git;
- no direct marketplace scraping;
- assistant kill switch;
- current product-claim approval gate.

## Deployment maturity

~~~text
M1: Core VPS begins
M2: Chatwoot production channel
M3: assistant runtime
M4: CRM sidecar
M5/M6: import/API workers
M7: ERP separate deployment if adopted
~~~
