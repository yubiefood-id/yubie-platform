# M4.5-RC Acceptance Report

**Date:** 2026-09-20

## Final verdicts (separate axes)

| Axis | Verdict |
|------|---------|
| **CODE** | **PASS** |
| **STAGING** | **BLOCKED_EXTERNAL** |
| **WHATSAPP** | **BLOCKED_EXTERNAL** |
| **SECURITY** | **PASS** (code); live pen test pending |
| **BACKUP_RESTORE** | **BLOCKED_EXTERNAL** |
| **PRODUCTION_READY** | **NO** |
| **PRODUCTION_ACTIVE** | **NO** |

## Acceptance gates

| Gate | Status |
|------|--------|
| M4 committed locally | PASS — `22179ae`..`3e9f28a` |
| M1→M4 history on `origin/main` | PASS — pushed `3e9f28a` |
| `npm ci` | PASS |
| `npm run check` | PASS |
| `npm run build` | PASS |
| Clean DB migrations 0001→0004 | PASS |
| Zammad 7.1.3 pinned | PASS |
| Upstream compose commit pinned | PASS — `c305102` |
| Real Zammad staging healthy | BLOCKED_EXTERNAL |
| Data services not public | BLOCKED_EXTERNAL |
| Backup exists | BLOCKED_EXTERNAL |
| Restore drill | BLOCKED_EXTERNAL |
| Meta WhatsApp inbound | BLOCKED_EXTERNAL |
| Real Zammad trigger | BLOCKED_EXTERNAL |
| HMAC/Bearer live verification | BLOCKED_EXTERNAL |
| Duplicate dedupe live | BLOCKED_EXTERNAL |
| Bot/agent article ignore | BLOCKED_EXTERNAL |
| Real outbound to WhatsApp | BLOCKED_EXTERNAL |
| AMBIGUOUS reconcile live | BLOCKED_EXTERNAL |
| RED intent handoff live | BLOCKED_EXTERNAL |
| Human > bot race live | BLOCKED_EXTERNAL |
| SHADOW/SUGGEST/GREEN live | BLOCKED_EXTERNAL |
| Emergency OFF | CODE PASS — runbook added |
| Restart/chaos matrix | BLOCKED_EXTERNAL |
| No secrets in source | PASS |
| Docs truthful | PASS |

## Code evidence

- Provider-neutral port: `packages/application/src/ports/support-conversation-provider.ts`
- Zammad adapter: `packages/integrations/src/zammad/`
- Webhook: `apps/bot` `POST /webhooks/zammad`
- Worker: `assistant.process` → `support.reply` → `support.reconcile`
- Migration: `0004_m4_zammad_provider.sql`
- Tests: `packages/integrations/tests/zammad.test.mjs` (7 cases)
- Worker metrics: `apps/worker/src/metrics.ts`
- Lock: `infrastructure/zammad/zammad.lock.json`

## Next steps for operator

1. Deploy staging per runbooks
2. Execute live matrix in M4.5 reports
3. Update this report axes to PASS when evidenced
4. Authorize production cutover separately per `zammad-cutover.md`

## M5 gate

M4.5 GO for **code release** is satisfied. M4.5 GO for **production** requires staging validation completion. Next milestone: **M5-B2B** after production-ready Zammad support path is proven.
