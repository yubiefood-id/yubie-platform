# 08 — Chatwoot Production

## 1. Role

Chatwoot is the WhatsApp/customer conversation system. It is not product truth or B2B deal authority.

## 2. Hosting options

Managed Chatwoot reduces operational burden.

Self-host when data/control/cost justifies operating Rails, PostgreSQL, Redis, storage, backups and upgrades.

Official Sep 2026 guidance recommends around 4+ cores, 8 GB RAM minimum and 60 GB SSD for production.

## 3. Recommendation

If self-hosted, use a dedicated host or a clearly over-provisioned separate failure domain. Do not squeeze Chatwoot onto the 8 GB Core VPS.

## 4. WhatsApp

Use the official WhatsApp Cloud API channel.

Production inventory includes:

- WABA/business ownership;
- phone number;
- access token/system user;
- template policy;
- team ownership.

## 5. Yubie boundary

Chatwoot should still support human conversation if Yubie's assistant is disabled/unavailable.

Yubie receives events through its own webhook/integration boundary.

## 6. Backup

Self-hosted Chatwoot requires its own database and media/object-storage backup. Yubie Core backup does not include it.

## 7. Upgrade

Pin release, staging upgrade first, backup, migrate, smoke inbox/API/WhatsApp, production rollout, monitor workers/Redis/DB.

## 8. Access

Named agents/admins, prompt offboarding, MFA/SSO where available, API tokens by purpose.

## 9. Metrics

First response, open/unassigned age, delivery errors, webhook lag, B2B/safety queues.

## 10. Outage

Assistant stops; human channel recovery and reconciliation follow the Chatwoot runbook.
