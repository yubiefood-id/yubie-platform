# M4-Z Implementation Plan

## Objective

Replace Chatwoot transport with self-hosted Zammad while preserving `packages/assistant`, durable inbox/outbox, human-over-bot invariant, and M3 reliability patterns.

## Integration order (completed in code)

1. Authoritative baseline (`M4_ZAMMAD_BASELINE.md`)
2. `SupportConversationProvider` port (`packages/application`)
3. Schema expand `0004_m4_zammad_provider.sql`
4. Zammad staging infra (`infrastructure/zammad/`)
5. Zammad REST adapter (`packages/integrations/src/zammad/`)
6. Zammad webhook verifier + `POST /webhooks/zammad`
7. Worker provider injection (`support.reply`, `support.reconcile`)
8. Zammad context provider
9. Durable reply via outbox
10. Handoff mapping (`buildHandoffCommand`)
11. Reconciliation (`reconcileSupport`)
12. `SUPPORT_PROVIDER` selector
13. `npm run zammad:provision`
14. Contract tests (no full Zammad in CI)
15. Staging QA (operator)
16. Shadow → Suggest → GREEN (operator)
17. Production cutover (explicit authorization)

## Provider boundary

| Layer | Zammad awareness |
|-------|------------------|
| `packages/domain` | None |
| `packages/assistant` | None |
| `packages/application` | Port types only |
| `packages/integrations` | Adapters |
| `apps/bot`, `apps/worker` | Transport wiring |

## Dual provider window

- `SUPPORT_PROVIDER=chatwoot|zammad|fake`
- Chatwoot routes/queues retained for rollback
- Never auto-reply on both providers for same channel

## Staging checklist

- [ ] Zammad VPS up with private data stores
- [ ] WhatsApp test channel connected
- [ ] Trigger fires only on customer WhatsApp articles
- [ ] Webhook HMAC + optional Bearer pass
- [ ] End-to-end SHADOW observation
- [ ] Human takeover race test

## Production gate

Requires explicit operator authorization per `docs/production/runbooks/zammad-cutover.md`.
