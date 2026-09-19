# ADR-005: Self-Hosted Chatwoot

## Status

Accepted — 2026-09-19

## Context

Yubie requires WhatsApp conversation operations on infrastructure it controls. Chatwoot is the inbox authority for message history, agent workflows, and WhatsApp Cloud API integration.

## Decision

1. Deploy Chatwoot self-hosted on a dedicated conversation failure domain (Profile B) or isolated compose stack (Profile A dev).
2. Use Chatwoot **v4.13.0+** for signed AgentBot webhooks.
3. Keep Chatwoot PostgreSQL and Redis separate from Yubie Core database.
4. Connect Meta WhatsApp Cloud API to a Chatwoot inbox; configure AgentBot **Yubie Assistant** pointing to `apps/bot` webhook.
5. Chatwoot remains usable by human agents when Yubie bot/assistant is offline.

## Consequences

- Separate backup/restore for Chatwoot DB and media.
- Operator must supply WABA credentials, SMTP, and TLS DNS (`support.yubie.id`).
- Yubie stores structured session state only; not full message mirrors.

## Rollback

Disable AgentBot or route inbox to human-only; Chatwoot continues operating.
