# M4-Z Migration Report

## Summary

M4-Z replaces Chatwoot transport with Zammad while preserving the assistant core. Chatwoot adapters remain for rollback.

## Baseline

- M3-PROD committed at `d07552f`
- M1/M2 local; not pushed to `origin/main`

## Implemented

- Provider port: `SupportConversationProvider`
- Adapters: Fake, Chatwoot, Zammad
- Bot route: `/webhooks/zammad` (HMAC-SHA1 + Bearer)
- Worker: `support.reply`, `support.reconcile` (+ Chatwoot queue aliases)
- Migration: `0004_m4_zammad_provider.sql`
- Infra: `infrastructure/zammad/` with pinned lock
- Provisioning: `npm run zammad:provision`
- Docs: API contract, ADR-009/010, runbooks

## Not done (requires operator)

- Live Zammad VPS deployment
- Meta WhatsApp production cutover
- Chatwoot retirement (post-rollback window)

## Historical data

No Chatwoot production data — no import performed.

## Rollback

`SUPPORT_PROVIDER=chatwoot` + Chatwoot infrastructure retained. See `zammad-rollback.md`.
