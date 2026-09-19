# Zammad Production Cutover

**Requires explicit operator authorization.**

## Pre-cutover

- [ ] Staging SHADOW/SUGGEST/GREEN passed (`M4_ZAMMAD_STAGING_REPORT.md`)
- [ ] Security review complete (`M4_ZAMMAD_SECURITY_REVIEW.md`)
- [ ] Rollback runbook reviewed
- [ ] Meta WhatsApp production credentials ready
- [ ] Zammad production VPS healthy
- [ ] Chatwoot backup taken

## Sequence

1. Announce maintenance window
2. Set `assistant_runtime_config` mode **OFF**
3. Disable Chatwoot bot automation
4. Backup Chatwoot + Zammad
5. Connect production Meta WhatsApp to Zammad channel
6. Verify human-only inbound/outbound (no bot)
7. Enable Zammad → Yubie webhook; verify inbox ingestion
8. `SUPPORT_PROVIDER=zammad` on worker/bot
9. Enable **SHADOW** → observe 24h
10. Enable **SUGGEST** → observe
11. Enable **GREEN** auto for approved intents only
12. Keep Chatwoot read-only for rollback window (default 14 days)

## Success criteria

- WhatsApp → Zammad → Assistant → Zammad → WhatsApp for GREEN intents
- RED/AMBER/food-safety → correct human group
- Emergency OFF → human support only

## Abort

If critical failure: execute `zammad-rollback.md` immediately.
