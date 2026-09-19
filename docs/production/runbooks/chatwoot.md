# Chatwoot Runbook

## Stack

- Image: `chatwoot/chatwoot:v4.13.0`
- Services: web, sidekiq, postgres, redis
- DNS: `support.yubie.id`

## Initial setup

1. `docker compose -f infrastructure/chatwoot/docker-compose.yml up -d`
2. Create super-admin via Chatwoot setup wizard
3. Configure WhatsApp Cloud inbox (Meta credentials — operator supplied)
4. Create AgentBot **Yubie Assistant** with webhook `https://bot.yubie.id/webhooks/chatwoot-agentbot`
5. Store AgentBot signing secret in `CHATWOOT_AGENTBOT_SECRET`

## Backup

- Daily `pg_dump` of Chatwoot PostgreSQL
- Object storage backup for uploads (production Profile B)

## Upgrade

1. Backup DB and media
2. Pin new image tag in compose
3. Staging smoke: inbox, WhatsApp send/receive, AgentBot webhook
4. Production rollout during low-traffic window

## Rollback

Revert image tag; restore DB if migration failed. Disable AgentBot for human-only mode.

## Outage

Humans continue in Chatwoot. Yubie bot failures do not block inbox. Alert on webhook lag and Sidekiq queue depth.
