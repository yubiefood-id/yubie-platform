# Zammad Rollback

Use when Zammad cutover fails and customer messages must not remain in a half-configured dual system.

## Immediate actions (< 15 min)

1. Set assistant runtime **OFF** (`/ops/assistant/emergency-off`)
2. Set `SUPPORT_PROVIDER=chatwoot` on worker/bot; redeploy
3. Disable Zammad bot trigger/webhook
4. Re-enable Chatwoot AgentBot automation (if previously active)
5. Re-point Meta WhatsApp to Chatwoot **or** operate human-only in Chatwoot until channel restored

## Validation

- [ ] Customer message reaches human inbox
- [ ] No automated duplicate replies
- [ ] Yubie webhook ingestion stopped for Zammad

## Data

- Zammad tickets created during failed cutover: retain in Zammad for operator review
- No automatic mass import back to Chatwoot

## Post-incident

- Document in `M4_ZAMMAD_MIGRATION_REPORT.md`
- Root cause before retry
