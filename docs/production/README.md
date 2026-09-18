# Yubie Production Handbook

## Current production model

Yubie's current production path is marketplace-first for D2C and WhatsApp-first for assisted B2C/B2B.

~~~text
Yubie Web
  -> Shopee / Tokopedia & Shop

Yubie Web
  -> WhatsApp
  -> Chatwoot
  -> Assistant or Human
  -> CRM for qualified B2B only
~~~

Direct web checkout/payment remains deferred by [ADR-004](./ADR-004_MARKETPLACE_WHATSAPP_FIRST.md).

## Production architecture documents

- [Production Readiness Model](./00_PRODUCTION_READINESS_MODEL.md)
- [Target Architecture](./02_TARGET_SYSTEM_ARCHITECTURE.md)
- [Data/Persistence](./03_DATA_MODEL_AND_PERSISTENCE.md)
- [API/Integration Contracts](./04_API_AND_INTEGRATION_CONTRACTS.md)
- [Marketplace Order Boundary](./05_ORDER_PAYMENT_INVENTORY_FULFILMENT.md)
- [Security/Privacy](./06_SECURITY_PRIVACY_AND_ACCESS.md)
- [Reliability/SLOs](./07_RELIABILITY_OBSERVABILITY_AND_SLOS.md)
- [CI/CD](./08_CI_CD_AND_RELEASE_ENGINEERING.md)
- [Testing](./09_TESTING_AND_QUALITY_STRATEGY.md)
- [Analytics](./10_ANALYTICS_EXPERIMENTATION_AND_GROWTH.md)
- [B2B/CRM Operations](./11_B2B_CRM_AND_OPERATOR_OPERATIONS.md)
- [Incidents](./12_INCIDENT_RESPONSE_AND_RUNBOOKS.md)
- [Roadmap](./13_PRODUCTION_DELIVERY_ROADMAP.md)
- [Go Live](./14_GO_LIVE_CHECKLIST.md)
- [Capacity/Cost/Vendors](./15_CAPACITY_COST_AND_VENDOR_GOVERNANCE.md)

## VPS implementation handbook

The production-grade single-server/multi-sidecar baseline is documented in [vps/README.md](./vps/README.md).

It covers:

- Ubuntu host baseline;
- network/DNS/TLS;
- Docker Compose service layout;
- PostgreSQL backup/PITR;
- secrets and access;
- CI/CD deployment;
- observability;
- Chatwoot;
- CRM;
- security hardening;
- disaster recovery;
- final go-live.

## Precedence

Where older production documents assume yubie.id must own D2C checkout/payment/reservation, ADR-004 and the current marketplace/WhatsApp development documents supersede those assumptions.

Controls that remain universally valid:

- product truth and evidence;
- food-safety escalation;
- privacy/minimization;
- least privilege;
- authenticated/replay-safe webhooks;
- idempotency/reconciliation;
- backup/restore;
- observable failure;
- rollback/incident response.
